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

The `writeMemory` function lets you store information within your trading strategy, associating it with a specific memory identifier. Think of it as creating labeled containers for data that your strategy needs to remember. This function automatically handles saving the data based on whether your strategy is running a backtest or live trading, and it works seamlessly with the signal system to keep everything organized. You provide the name of the bucket, a unique ID for the memory location, the data you want to store (which can be any object), and a helpful description for what’s being saved. This provides a convenient way to keep track of state and information throughout your trading logic.


## Function warmCandles

This function helps prepare your backtesting environment by downloading and storing historical price data, often called candles. Think of it as pre-loading the data your strategies will need. It fetches all the candles – which represent the open, high, low, and close prices – for a specified time period, from a start date to an end date.  The function downloads candles based on the interval you define (e.g., 1-minute, 1-hour, daily) and then saves them for fast access during backtesting, significantly speeding up the process.  You provide the start and end dates as part of its configuration.

## Function waitForReady

This function ensures that all the necessary components are fully loaded and ready before you begin backtesting or live trading. It waits for the registries related to exchange, frame, and strategy data to be populated. 

Essentially, it checks these registries every second, and it will keep waiting until everything is ready, or until a timeout is reached.

When doing a backtest, it makes sure that data for the exchange, frame, and strategy are all available. If you are running live, it only needs the exchange and strategy data.

This is helpful when those components are loaded asynchronously, like when using plugins or fetching data remotely, so you don't try to start trading before everything is in place. If it doesn’t finish within a certain time, it won't throw an error itself, but you should be ready to handle potential errors from trying to start the backtest or live trading.

You can specify if you're running a backtest or live mode using the `isBacktest` parameter – if `true`, it will wait for frame data as well.

## Function validate

This function helps you make sure everything is set up correctly before you start your backtests or optimizations. It checks if all the entities you're using – like exchanges, strategies, and sizing methods – are properly registered in the system.

You can tell it to validate specific entities, or if you leave it blank, it will automatically check *everything* to give you a complete overview.

It's a quick way to catch configuration errors early on and avoid unexpected problems later. The validation results are saved so it runs faster the next time.

## Function stopStrategy

This function pauses a trading strategy, effectively preventing it from creating any new trade signals. 

It doesn't immediately close existing open positions; instead, those positions will finish normally. 

Whether the process is a backtest or a live trade, the system will gracefully halt at a suitable point, such as when it’s idle or after a signal has completed.

You specify which strategy to stop by providing the trading symbol, and the framework automatically figures out if it's running a backtest or a live trade.


## Function shutdown

This function helps you safely end a backtesting run. It triggers a shutdown event that lets all parts of your backtest, like data handlers or trading strategies, clean up and save any important information before the program closes. Think of it as a polite way to tell your backtest "it's time to finish up" so everything is handled correctly. It’s especially useful when you want to stop a backtest gracefully, like when you press Ctrl+C.

## Function setStrategyPaused

You can temporarily stop a trading strategy from opening new positions using this function. Think of it as putting the strategy on hold. While it’s paused, the framework won't execute new trading signals and any signals waiting to be processed will remain queued until you resume the strategy. Existing orders that are already in place will still be handled as usual. This pause state is saved so it will still be active even after restarts. To reactivate the strategy, you'll need to explicitly tell it to unpause. A notification is sent when the strategy changes between paused and active states. The function automatically adjusts its behavior based on whether it’s running a backtest or a live trading session.

It takes two inputs: the symbol of the trading pair (like BTC-USDT) and a boolean value indicating whether the strategy should be paused (true) or resumed (false).

## Function setSignalState

This function lets you update a specific value associated with a trading signal, kind of like keeping track of a running total for each trade. It's designed to work within the backtest-kit framework, automatically recognizing whether you're in a testing or live trading environment. The function handles resolving the current signal, ensuring there’s one actively waiting or scheduled. 

It's particularly useful for advanced strategies that monitor metrics like how long a trade is open and its percentage gain, useful for automated decision-making. These strategies aim to manage risk, targeting small drawdowns and profit goals while using criteria such as the length of time a trade is open and its percentage gain to trigger exits. 

You provide the trading symbol, a way to dispatch data, and a data transfer object containing the bucket name and initial value for the state you're updating. The function returns the updated state information.


## Function setSessionData

This function lets you store information that lasts throughout a backtest or live trading session. Think of it as a temporary storage space linked to a specific trading pair.

You can use it to remember things like results from complex calculations, the state of indicators, or anything else that needs to be preserved between candles.

It's designed to be persistent, meaning if your process restarts unexpectedly, that stored data will still be available.

To clear the stored value, simply pass `null` as the value. The function automatically figures out whether it's running in backtest or live mode.

You provide the symbol for the trading pair you're working with and the value you want to store.

## Function setLogger

This function lets you customize how the backtest-kit framework logs information. 

You can provide your own logging system – like sending logs to a file, a database, or a monitoring tool – instead of using the default. 

The framework will automatically add helpful details to each log message, such as the trading strategy name, the exchange being used, and the symbol being traded, so you have all the context you need.  Just provide an object that conforms to the `ILogger` interface.

## Function setConfig

This function lets you adjust the overall behavior of the backtest-kit framework. You can provide a set of new settings to replace some of the default values. Think of it as fine-tuning how the system operates.  There's also a special flag, `_unsafe`, which is mainly used in testing situations to bypass certain checks – use this with caution!

## Function setColumns

You can customize the columns that appear in your backtest reports by using the `setColumns` function. This lets you change the default column definitions for different report types, essentially tailoring the information presented. When you provide a new configuration, it's checked to make sure it's structured correctly. There’s a special `_unsafe` option, which you'd only use in testing scenarios to bypass these validations.

## Function searchMemory

The `searchMemory` function helps you find relevant information stored in your memory system. It's designed to quickly locate entries based on a search query, using a sophisticated scoring system called BM25 to rank the results. 

This function figures out whether it's running in a backtest or live environment on its own, and it automatically uses the correct signal from the current process.

You provide the function with the name of the memory bucket to search and the search term you’re looking for.

The function returns a list of matching memory entries, along with a score indicating how well they match your query and the content of the entries. It gives you the memory ID as well.

## Function runInMockContext

The `runInMockContext` function lets you execute code as if it were running within a backtest or live trading environment, but without actually running a full backtest. Think of it as setting up a pretend context for your code.

This is really helpful for testing things or writing scripts that rely on things like the current trading timeframe.

You can customize the environment it creates – specifying the exchange, strategy, frame, symbol, whether it's a backtest, and the time. If you don't specify these, it creates a simple, live-mode environment with placeholder names and the current minute. It's a great tool for isolated testing and experimentation.

## Function removeMemory

This function lets you delete a specific memory entry associated with a signal. Think of it as cleaning up old data related to a trading signal. 

It automatically handles whether you're running a backtest or a live trading environment, so you don't need to worry about that.

To use it, you'll provide two pieces of information: the name of the "bucket" where the memory is stored, and the unique ID of the memory entry itself.


## Function readMemory

The `readMemory` function lets you retrieve data stored in memory, specifically data associated with a particular signal. Think of it as fetching a saved value for a specific situation. 

It automatically figures out whether you're running a backtest or a live trading session, and it also knows which signal is currently active.

You provide the function with two pieces of information: the name of the "bucket" where the memory is stored and the unique identifier for the memory item itself. The function then returns the data, assuming it's of a type you expect. 

This allows you to easily access previously saved information to make decisions in your trading logic.


## Function overrideWalkerSchema

This function lets you tweak a previously set-up walker configuration, which is used for comparing different strategies. Think of it as a way to make small adjustments to how your strategies are evaluated without completely rebuilding the entire walker setup. You provide only the parts of the configuration you want to change; everything else stays the same. It returns a promise that resolves to the updated walker configuration.

## Function overrideSweepSchema

This function lets you modify an existing sweep configuration. Think of a sweep as a predefined set of actions or steps for your backtesting. You can use it to change specific parts of that configuration, like its settings or parameters. 

It's important to know that because of how the system handles sweep configurations, any changes you make won't affect sweeps that have already been created. They'll only apply to new sweeps created afterward. If you need to refresh the sweep configuration entirely, you might need to clear the sweep connection service. 

The function accepts a configuration object where you specify which fields of the sweep you want to update. Only those fields you provide will be changed; the rest will stay as they were.

## Function overrideStrategySchema

This function lets you modify a trading strategy that's already been set up within the backtest-kit framework. Think of it as a way to tweak an existing strategy—you don’t need to recreate it entirely. You can provide just the parts of the strategy you want to change, and everything else will stay the same. It's useful for making adjustments or fine-tuning a strategy's configuration without starting from scratch. You'll be providing a configuration object that contains the specific parameters you want to override.

## Function overrideSizingSchema

This function lets you tweak an existing position sizing setup. Think of it as making small adjustments to a sizing strategy without completely rebuilding it. You provide a new configuration object with just the parts you want to change, and it updates the existing sizing schema accordingly. Anything you don't specify in your new configuration stays the same.


## Function overrideRiskSchema

This function lets you adjust the risk management settings that are already set up within the backtest-kit framework. Think of it as fine-tuning—you can specify only the parts of the risk configuration you want to change, leaving everything else untouched. It’s useful when you need to make small adjustments without redefining the entire risk management system.  You provide a partial configuration object, and it updates the existing configuration accordingly.

## Function overrideMCPSchema

This function lets you tweak an already-existing MCP (Model Context Protocol) setup within the backtest-kit framework. Think of it as a way to adjust specific parts of a configuration without having to rebuild the entire thing. You provide a snippet of the updated configuration, and it merges those changes into the existing MCP, leaving everything else untouched. It’s useful for making small adjustments or overrides to your core model context setup.

## Function overrideFrameSchema

This function lets you modify the settings for a specific timeframe you're using in your backtest. Think of it as fine-tuning how data is handled for a particular timeframe like daily or weekly. You’re not replacing the entire timeframe setup, just updating specific parts of it. This is helpful if you need to change something like the data aggregation method or the way calculations are performed for that timeframe. You provide a partial configuration, and only the fields you specify will be changed; everything else remains as it was previously set.

## Function overrideExchangeSchema

This function lets you modify an already set up data source for an exchange within the trading framework. Think of it as making adjustments to an existing exchange's settings instead of creating a new one from scratch. You provide a partial configuration, and only the information you supply will be changed; everything else remains as it was. It's a handy way to refine your exchange data without rebuilding the entire connection.

## Function overrideActionSchema

This function lets you adjust how a specific action is handled within the backtest-kit system without having to completely replace the existing setup. Think of it as making targeted tweaks to an action’s configuration – you can change just the parts you need to update. 

It's helpful when you need to adapt how events are processed, maybe by swapping out callback functions for different environments or dynamically changing how actions behave, all while keeping the core strategy intact. The provided configuration only affects the fields you specify; everything else remains as it was before. It's a way to make updates more flexible and less disruptive.

## Function listenWalkerProgress

This function lets you keep track of how a backtest is progressing. It's like getting updates after each strategy finishes running within the backtest.

You provide a function that will be called with information about the progress.

Importantly, the updates are handled one at a time to avoid any issues with multiple callbacks running simultaneously. This ensures a smooth and reliable way to monitor the backtest’s execution.


## Function listenWalkerOnce

The `listenWalkerOnce` function lets you track the progress of a walker and react to specific events. You provide a filter – essentially a rule – to identify the events you're interested in. When an event matches your rule, a provided callback function runs once, and then the tracking automatically stops. This is perfect for situations where you need to wait for a particular condition to be met during the walker’s process. 

It takes two things: a function to filter events and another function to execute when a matching event is found. The function returns another function which you can call to stop the listener.


## Function listenWalkerComplete

This function lets you be notified when a backtest run finishes. It's like setting up an alert that goes off when all your trading strategies have been tested.

The function provides a way to handle these completion events one at a time, even if the notification itself takes some time to process. This ensures that the results are handled in the order they come, preventing potential conflicts. You simply provide a function that will be executed when the backtest is complete.


## Function listenWalker

The `listenWalker` function lets you tap into the progress of a backtest run. It’s a way to get notified as each strategy finishes within the backtest. 

Think of it as subscribing to updates - after each strategy completes, a notification (an event) is sent to your provided function.

This function ensures that these notifications are handled one at a time, even if your notification function takes some time to process, preventing any unexpected issues from concurrent operations. You'll get these notifications in the order that the strategies finish executing.


## Function listenValidation

This function lets you keep an eye on potential problems during risk validation. 

It's like setting up a listener that gets notified whenever a validation check fails and throws an error. 

You provide a function that will be called whenever an error occurs, allowing you to debug or monitor these failures. The errors are handled one at a time, ensuring a smooth and controlled response even if the function you provide takes some time to run.


## Function listenSync

The `listenSync` function lets you listen for events related to order synchronization, like when a signal is being opened or closed. It’s designed for situations where you need to react to these events and potentially handle errors. 

If something goes wrong within your listener function – for instance, a plain error or a temporary issue – the system will automatically try to retry the operation.  For rejected orders, the operation is immediately stopped.

The listener you provide gets called with an `OrderSyncContract` object, which contains information about the event. If your listener function returns a promise, the system will pause processing until that promise resolves.

Be aware that errors of a particular type will be treated differently: a user protocol violation results in a retry, while a rejected order ends the process without a retry attempt.

## Function listenStrategyCommitPerSignal

This function lets you keep an eye on what's happening when a trading strategy makes decisions. It’s like setting up a notification system that alerts you whenever a new trading signal appears. Importantly, it’s designed to avoid overwhelming you with repetitive notifications – you’ll only receive one notification per signal, even if multiple decisions related to that signal are made.

You can fine-tune the notifications by providing a filter. This allows you to only receive updates for specific types of events you're interested in. The provided callback function is then executed each time a matching event is detected, giving you a chance to react to the latest signal commitment.


## Function listenStrategyCommitOnce

This function lets you react to specific changes in your trading strategy, but only once. 

Think of it as setting up a temporary listener that waits for a particular event to happen, executes your code once when it does, and then disappears. 

You provide a filter to identify the exact events you're interested in, and a function that will be run when that event occurs. It automatically takes care of stopping the listener after that single execution, so you don't have to worry about managing subscriptions. It's perfect for scenarios where you need to perform an action based on an initial strategy change.


## Function listenStrategyCommit

This function lets you keep an eye on what's happening with your trading strategies. It’s like setting up a listener that gets notified when certain actions are taken, such as canceling a scheduled trade, closing a trade, adjusting stop-loss or take-profit levels, or moving a stop-loss to break-even. 

The listener function you provide will be called whenever one of these actions happens. Importantly, these events are handled one after another, even if your listener function takes some time to process things. This helps prevent things from getting out of order or conflicting with each other. You can unsubscribe from these events at any time by calling the function that the listener returns.

## Function listenSignalWaitingPerSignal

This function lets you react specifically when a signal you're waiting on meets certain conditions. Imagine you're tracking several signals, and you only care about what happens when a specific signal finally completes its waiting period.

It’s designed for situations where you want to know the *very first* time a waiting signal satisfies a particular rule – it then stops reporting on that signal.

You provide a filter to identify which signals you're interested in, and a function that's called whenever a matching signal becomes available. The function you provide will only be called once per signal ID.


## Function listenSignalWaiting

This function lets you listen for updates while a trading signal is still waiting to be triggered. Think of it as getting a stream of information about what's happening before a signal actually goes off. It sends updates for *every* tick while a signal is pending, which can be a lot of data if you have multiple signals waiting. If you only need updates for a specific signal, you might want to explore the `listenSignalWaitingPerSignal` option instead, as it’s more targeted. You provide a function that will be called with information about each waiting tick. The function you provide will return a function that, when called, will unsubscribe from these updates.

## Function listenSignalScheduledPerSignal

This function lets you react to scheduled tick results, but only when a new signal appears. Think of it as a way to get notified each time a fresh signal is generated, allowing you to process it. 

You provide a filter to determine which tick results you're interested in, and a function that will be executed for each new signal that meets that filter. This provides a focused way to handle new signal events. The function returns an unsubscribe function, so you can stop listening when you're done.

## Function listenSignalScheduled

This function lets you listen for signals that are scheduled – think of them as orders waiting for a specific price to be hit. 

It's useful when you want to react to signals that aren't triggered immediately but are waiting for a price condition.

You provide a function (`fn`) that will be called whenever a new scheduled signal is created or when it's being monitored while waiting for its price target. The information passed to your function includes details about that particular scheduled tick result.

This subscription will be removed by the function that is returned.


## Function listenSignalPerSignal

This function lets you react to specific trading signals generated within your backtest. Think of it as setting up a listener that only gets triggered when a new signal appears and meets certain criteria you define. You provide a filter to narrow down the signals you're interested in, and then a function that will execute whenever a matching signal is received. The listener ensures you only get notified about signals with an associated signal ID, and it skips any idle events, guaranteeing that the callback function always receives data related to an actual signal. This is useful for tasks like logging signals, triggering actions based on signal changes, or performing real-time analysis.

## Function listenSignalOpenedPerSignal

This function lets you keep an eye on when new trading signals are opened. It’s useful if you want to react to signals being triggered, whether they're from a live trading environment or a backtest. 

You provide a filter – a way to specify which signals you’re interested in – and a function that gets called each time a new, filtered signal is opened. The function you provide will receive details about the opened signal, allowing you to take action based on that information. Importantly, you’ll only receive a notification once for each distinct signal ID, ensuring you don’t get overwhelmed with repeated events. This subscription can be cancelled when it’s no longer needed.


## Function listenSignalOpened

This function lets you listen for when new trades are initiated, whether they happen in real-time or during a backtest. It's like setting up an alert that goes off every time a position begins. You provide a function that will be executed with details about the trade that was just started. The function you provide will return a function to unsubscribe from receiving these alerts later.

## Function listenSignalOnce

`listenSignalOnce` lets you react to specific signal events just once and then automatically stop listening. It's like setting up a temporary alert – you provide a condition (`filterFn`) that must be met, and a function (`fn`) that gets executed when that condition is true. Once the condition is met and the function runs, the subscription is automatically removed, so you won't get any more notifications.

This is really helpful when you need to wait for a particular event to happen and then take action immediately, without needing to manage the subscription yourself.


## Function listenSignalNotifyPerSignal

This function lets you set up a listener that gets notified whenever a new trading signal arrives, but only once for each unique signal ID. It’s designed to handle situations where a trading strategy might be sending out lots of signal updates for the same position – you’ll only receive one notification for that signal, preventing unnecessary processing. You provide a filter to specify which signals you’re interested in, and a callback function that will be executed with the signal information when a matching signal arrives. The listener function you get back allows you to stop the notifications when you no longer need them.


## Function listenSignalNotifyOnce

This function lets you temporarily react to specific signal events. You provide a filter to identify the events you're interested in, and a function to execute when a matching event occurs.  It's designed for one-time actions; after the callback runs once, the subscription automatically stops, ensuring you don't keep processing events unnecessarily. It’s great for things like immediately taking action based on a specific signal and then forgetting about it. The filter function determines which events trigger your callback, and the callback itself handles the event data.

## Function listenSignalNotify

This function lets you keep an eye on what's happening with your trading signals. Whenever a strategy uses `commitSignalInfo` to send out a notification about a trade, this function will notify you.

It's designed to handle these notifications one at a time, even if your notification handling code takes some time to complete. This ensures a smooth and orderly flow of information.

You provide a function that will be called with details about the signal, allowing you to react to those notifications as needed. When you’re finished listening, the function returns another function that you can call to unsubscribe.

## Function listenSignalLiveWaitingPerSignal

This function lets you react to specific events during live trading when your strategy is waiting for an order to trigger. It’s designed to avoid overwhelming you with updates – it only calls your function once for each signal, even if the waiting period is long. 

Think of it as listening for a signal while your order is patiently waiting to be filled.

It only works with live trading data from `Live.run()`, so you won't get these events during backtesting.

Importantly, it remembers which signals it's already processed for each unique trading scenario (strategy, exchange, timeframe, mode, and symbol), so different strategies won’t interfere with each other’s notifications. The filter function you provide gets checked first, so if an event doesn't match your criteria, it's immediately skipped, and won't affect future events.


## Function listenSignalLiveWaiting

This function lets you listen for updates as a trading strategy waits for a signal to trigger. It's specifically designed for live trading scenarios, not backtesting.

You'll get frequent updates – essentially one update per tick – while a strategy is waiting for a signal to become active. These updates provide information about the potential entry signal and a theoretical profit/loss calculation, though no position is actually open yet. 

Because it only works with live data, it's perfectly safe to use for things like sending notifications or mirroring orders – actions that need to react to real-time conditions. You don't need to filter the events based on action type; the data is already narrowed to the waiting signal. 

To use it, you pass in a function that will be called with each waiting event. The function receives an object containing details about the waiting signal.


## Function listenSignalLiveScheduledPerSignal

This function lets you listen for specific events from live trading executions, ensuring you only receive each signal once. It's designed to work with live executions, not historical backtests.

The function provides a filter so you can choose which events to react to. Importantly, the filter is checked *before* any duplicate removal, meaning it can't accidentally suppress events that might match later.

To prevent conflicts when running multiple strategies simultaneously, the duplicate removal happens separately for each trading combination – like the strategy, exchange, frame, mode, and the traded asset. Each execution remembers the signal it's already processed and ignores repeats.

Essentially, it’s a way to reliably react to unique, filtered events during live trading.


## Function listenSignalLiveScheduled

This function lets you tap into live trading executions specifically when a strategy initiates a trade based on a scheduled event. Think of it as getting notified when the system is preparing to execute a trade based on a predetermined price target. 

It's a one-time notification that signals the start of the waiting period for that particular trade. You'll only receive this event during live trading sessions; backtesting simulations won't trigger it.

This makes it perfect for actions that need to happen in real-time, like sending alerts or mirroring orders, because you can be sure the action happens during a live trade. The information provided is specific to scheduled events, so you don't need to filter it based on the event type. 

You provide a function as input; this function will then be called whenever a scheduled signal is created. The function you provide will receive an event object containing details about the scheduled tick result.


## Function listenSignalLivePerSignal

This function lets you tap into the live stream of trading signals generated by backtest-kit. It's designed to give you the most granular view – you'll be notified for each individual signal as it comes in. 

Think of it as setting up a very specific alert system.  You provide a filter to specify which signals you're interested in, and then a function to be executed when one of those signals arrives. 

Importantly, this only works with signals produced during a `Live.run()` execution, and signals that are essentially "silent" (no signal) are ignored. The function returns another function that you can call to unsubscribe from the signal stream and stop receiving updates.


## Function listenSignalLiveOpenedPerSignal

This function lets you listen for when a trading strategy opens a new position during live trading. It ensures you only receive notifications for new positions—avoiding duplicate signals.

It only works with live trading data, not historical backtests.

The function uses a clever system to make sure you only get notified once per signal, even if things get a bit complex with multiple strategies running. It filters events using a provided function, and once an event passes that filter, it's guaranteed to be delivered just that one time. This prevents accidentally missing important updates.

## Function listenSignalLiveOpened

This function lets you listen for when a trading strategy actually starts a new position in a live trading environment. It’s triggered when a trade is opened, whether it's from an immediate signal or a scheduled event.

You'll get details about the trade, including the signal data (price, entry, stop-loss, and take-profit levels) directly passed to your function.

Crucially, this callback only works when you're actively running a live simulation – backtesting replays won't trigger it. This makes it safe for actions that interact with the real world, like placing orders, sending alerts, or sending notifications.

You don’t need to check the event type because the information is already filtered and relevant to opened positions. 


## Function listenSignalLiveOnce

This function lets you briefly tap into live trading signals generated by backtest-kit. It's a way to react to specific events happening during a live backtest, but only once.

You provide a filter – a condition – to determine which events you're interested in. Then, you give it a function that will be executed only once when that condition is met.  After the function runs, it automatically stops listening, so you don't have to worry about managing the subscription yourself. This is great for things like capturing a single data point or triggering a one-time action based on a live signal. The signal comes specifically from `Live.run()`.


## Function listenSignalLiveIdle

This function lets you listen for moments when your trading strategy isn't actively doing anything – it's not holding a position and has no actions planned. Think of it as a way to get notified when the strategy is "idle."

The callback you provide receives details about this idle state, like the current price and symbol being traded.

Crucially, this function only works during live trading sessions with `Live.run()`. You can safely use it for tasks that interact with the real world, like sending notifications or logging heartbeat signals, without worrying about it triggering during backtesting.

The information you get is straightforward; you won't have any signal data, so you can focus on the current market conditions and identity information.

## Function listenSignalLiveClosedPerSignal

This function lets you listen for when a live trading strategy has closed a position, but it only triggers once for each unique trading opportunity. Think of it as a way to react to the final result of a trade, ensuring you don't get bombarded with duplicate notifications.

It’s specifically designed to work with live trading sessions, meaning it won't fire during backtesting replays. 

The function is smart about avoiding duplicates - even if multiple strategies are running, each will receive the closure information for its specific trade. The `filterFn` gives you control over which closures you're interested in, and this filter runs *before* any duplicate checks, guaranteeing you don't miss important events. Essentially, it’s a safety net for ensuring you only handle distinct, closed positions.


## Function listenSignalLiveClosed

This function lets you listen for when a live trading strategy closes a position. 

It's designed for actions you want to take in the real world, like sending notifications or mirroring orders, because it only receives data from live executions – not backtests.

When a position closes, whether it's from a take profit, stop loss, expiration, or manual closure, you'll get a notification with details like the reason for closure, the timestamp, and the realized profit and loss including fees and slippage. 

Once a signal closes, no further events will be sent to this listener – it’s a terminal event. You provide a function that gets called with these closing events.

## Function listenSignalLiveCancelledPerSignal

This function lets you listen for when a trading signal is cancelled during live trading. It ensures you only receive each cancellation event once, even if the system tries to report it multiple times.

Think of it as a safety net that prevents duplicate notifications, mainly relevant in live executions.

It only works with live executions, not with historical backtests.

The function uses a special "deduplication" process, making sure that cancellations from different strategies don’t interfere with each other. You provide a filter function to decide which cancellations you're interested in. The callback function then gets triggered once for each cancellation that passes the filter. 


## Function listenSignalLiveCancelled

This function lets you listen for when a live trading signal is cancelled before it ever turns into an actual trade.

Imagine you set up a buy order, but the price moves unexpectedly or you decide to cancel it yourself – this is when `listenSignalLiveCancelled` gets triggered.

You'll receive details about *why* the signal was cancelled, such as a timeout or user intervention, and a unique identifier for the cancellation.

Crucially, this only applies to signals handled by `Live.run()`, not during backtesting replays. This makes it safe to use for things like sending real-time alerts or mirroring orders – actions you’d only want to perform in a live trading environment. You can be sure the event is narrowed and doesn't need extra checks.


## Function listenSignalLiveActivePerSignal

This function lets you set up a listener that reacts to specific active trading signals coming from live executions. It's designed to trigger only once for each signal that meets your criteria, giving you a way to react to things like a trade reaching a certain profit level. 

It only works with live, real-time data – backtesting won’t activate this listener. To prevent conflicts if you’re using multiple strategies, the listener keeps track of which signals it’s already processed for each trading setup. 

You provide a filter function to specify exactly which signals you want to react to. The listener will only fire once per signal, even if the signal keeps updating, and the filter function is checked *before* any duplicate suppression occurs, ensuring you don’t miss a signal just because of a timing issue.

## Function listenSignalLiveActive

This function lets you hook into real-time trading activity as your strategies are running live. It sends updates for every tick while you have open positions. 

Each update includes information about your current profit and loss, as well as how close you are to your take-profit and stop-loss levels.

It's specifically designed for actions that need to react to live trading, like sending alerts or placing orders based on the current position status. Importantly, this callback *only* works with live executions—it won’t be triggered during backtesting. 

You provide a function that will be called with the relevant data for each tick event.

## Function listenSignalLive

This function lets you set up a way to receive live trading signals as they happen during a backtest. It's designed to handle these signals one at a time, ensuring they are processed in the order they arrive. You provide a function that will be called whenever a new signal event occurs, allowing your code to react to the backtest's progress in real-time. Remember, this only works with signals generated during a `Live.run()` execution.

Essentially, it's a subscription mechanism for tracking what's happening during a live simulation.


## Function listenSignalIdle

This function lets you listen for moments when your trading strategy isn't actively doing anything – it has no open positions or signals. 

Think of it as a way to be notified when things are quiet.

You provide a function that will be called whenever this "idle" state occurs. 

The information passed to your function includes the current price and details about the strategy, exchange, and timeframe being used. It's useful for things like monitoring or running background tasks during inactive periods. 

The function returns another function which can be called to unsubscribe from the idle events.

## Function listenSignalEventPerSignal

This function lets you keep track of what's happening with individual trading signals. It listens for events related to signals, and it calls your provided function every time a new signal appears. 

You can use a filter function to specify exactly which kinds of events you’re interested in—for example, only "opened" signals, or only "closed" ones. The system makes sure you only get one notification per signal, even if a signal generates multiple events. Essentially, it's a way to react to changes in individual signals without being overwhelmed by every single event.


## Function listenSignalEventOnce

This function lets you temporarily "watch" for specific trading events within the backtest. You provide a filter to define exactly which events you’re interested in, and a callback function that will run *once* when that event happens. After the callback runs, it automatically stops listening, so you don’t have to worry about cleaning up subscriptions. It’s a convenient way to react to something like an order being filled or a position closing, and then move on.


## Function listenSignalEvent

The `listenSignalEvent` function lets you keep track of what's happening with your trading signals – when they're first created and when they’re finished. It's like setting up a notification system that tells you when a signal begins or ends, whether that’s because of a new signal being generated, or because of automatic actions like take profit, stop loss, or time expiration. These events are handled one at a time, even if the process of handling each one takes a little while.

You provide a function (`fn`) that will be called whenever a signal event occurs, and that function receives information about the event. This function will be called for both live trading and when you're testing strategies in a backtest.

The function you provide returns another function that you can use later to stop listening to these signal events if needed.


## Function listenSignalClosedPerSignal

This function lets you watch for when a trading signal closes, but importantly, it only triggers a notification for *each unique* signal.

You provide a filter function to decide which closed signals you're interested in.

Then, you give it a callback function that will be executed every time a new signal closes and passes your filter. This allows you to react to specific signal closures as they happen during a backtest or live trading. The function returns an unsubscribe function that can be called to stop listening.


## Function listenSignalClosed

This function lets you listen for when a trading position closes, whether it’s from a live trading session or a backtest. When a position completes and closes, it will trigger the function you provide. You'll get details like the profit and loss (pnl), the reason for closing, and the exact timestamp of the closure. It's a useful way to track how your strategies are performing and understand why positions are being closed. You can unsubscribe from this listener by calling the function that it returns.

## Function listenSignalCancelledPerSignal

This function lets you be notified when a trading signal is cancelled. It’s useful if you need to react specifically to cancelled signals, like cleaning up orders or adjusting your strategy. 

You provide a filter to specify which cancelled signals you're interested in, and a callback function that will be executed each time a new signal is cancelled and matches your filter. The function returns a cleanup function that you can call to unsubscribe from the events.


## Function listenSignalCancelled

This function lets you be notified when a trading signal is cancelled before a trade ever happens. 

Think of it as a way to catch situations where a signal gets dropped – maybe due to an error or an unexpected condition. 

You provide a function that will be called whenever this cancellation occurs, and that function will receive details about why the signal was cancelled, which can be helpful for understanding and debugging your trading system. It returns a function to unsubscribe from the event.

## Function listenSignalBacktestWaitingPerSignal

This function lets you listen for specific signals during backtesting, but in a smart way that avoids repeated notifications. It's designed to handle situations where a trade is "waiting" – essentially, when an order is placed but hasn't been filled yet.

The function will only send you information about a signal *once* – the very first time it meets certain conditions. Think of it as a way to only get notified when something new and relevant happens during the backtest.

Crucially, this listener only works with backtest data – it won’t trigger during live trading. It also makes sure that if you're running multiple strategies at the same time within the same backtest, they won't interfere with each other's notifications.

You define what constitutes a "relevant" signal using a filter function. This filter is checked *before* the deduplication happens, so you never miss an event just because it was previously processed.


## Function listenSignalBacktestWaiting

This function lets you listen for special events that happen during backtesting when a signal is waiting to be triggered. Imagine a signal that's set to go off based on a future condition – this callback gives you information about that waiting period.

It provides details like the signal itself and a theoretical profit and loss (pnl) calculation, even though no trade is actually open yet. Think of it as a sneak peek into what *could* happen.

This is specifically designed for backtesting runs, so you won't receive these events in live trading environments. It’s great for analyzing backtest results and creating reports without interference from live market data.

You pass in a function that will be called whenever a waiting event occurs, and the callback returns a function to unsubscribe from the events.

## Function listenSignalBacktestScheduledPerSignal

This function lets you listen for specific events during a backtest, ensuring you only receive each signal once. It's designed to process results from the backtest execution phase, so you won't get triggered during live trading.

Think of it as a way to selectively react to signals that meet certain criteria.

The function uses a built-in system to prevent duplicate signal notifications, even if you're running multiple strategies at the same time; however, the provided filter function is executed *before* any deduplication. This means the filter decides which events are even considered for deduplication. You define a test (`filterFn`) to choose which signals you want to react to and then provide a function (`fn`) that gets executed for each chosen signal.

## Function listenSignalBacktestScheduled

This function lets you listen for events that happen when a backtest strategy is set up to potentially enter a trade at a specific price. It’s like getting a heads-up that the strategy is waiting for the market to reach its target.

Think of it as the beginning of a waiting period – you’ll only receive this event once when the strategy initially sets up the wait, not for every tick while it's waiting.

Crucially, this is designed for analyzing backtest results specifically. You won’t get these events when trading live, keeping your live data clean and focused.

The events you receive will already be organized by action, so you can immediately access the data you need without needing to check what kind of event it is.

To use it, you simply provide a function that will be called whenever a scheduled signal event is created during a backtest. This allows you to build custom reporting or analysis tools focused on the initial setup of potential trades within backtest scenarios.


## Function listenSignalBacktestPerSignal

This function lets you tune into the signals generated during a backtest. It's designed to be very specific; you can use a filter to only receive events related to certain signals.  Essentially, it provides a way to react to each individual signal as it arises during the backtest process. Importantly, it only works with signals produced during an active backtest run, and it ignores signals that represent inactivity (where the signal is null). The process of delivering these signals avoids duplicates.

You provide a function (`filterFn`) to decide which signals you’re interested in, and a second function (`fn`) that will be executed each time a matching signal appears. The function it returns is a way to unsubscribe.


## Function listenSignalBacktestOpenedPerSignal

This function lets you listen for when a backtest starts a new trade, but it’s designed to avoid sending you the same information repeatedly. 

It only works with backtests – it won’t trigger during live trading.

You can use a filter to specify exactly which trades you’re interested in.

The function makes sure you only get notified once for each unique trade scenario, even if multiple strategies are running concurrently. Any signals that don’t match your filter are immediately discarded and won't trigger the callback. 

It's like a safeguard to ensure you only handle relevant signals and don't miss anything important.


## Function listenSignalBacktestOpened

This function lets you listen for when a trading position actually begins during a backtest. 

Think of it as getting notified the moment a trade is triggered – whether it’s an immediate order from your strategy or a planned entry. 

You'll receive details about the trade, including the price, entry point, and any stop-loss or take-profit levels. 

Importantly, this notification only happens during backtest simulations, so it’s ideal for analyzing your backtest results and generating reports without any interference from live trading data. It's a clean and focused channel for replay analysis.


## Function listenSignalBacktestOnce

This function lets you tap into the backtesting process and react to specific events as they happen. Think of it as setting up a temporary listener that only cares about certain signals during a backtest run. 

You provide a filter—a rule that decides which events you’re interested in—and a function that will be called *once* when a matching event arrives. Once that single event is processed, the listener automatically disappears, so you don't need to worry about cleaning it up. 

It's ideal for one-off tasks, like logging a particular market condition or triggering a very specific action during the backtest.


## Function listenSignalBacktestIdle

This function lets you listen for moments during a backtest when your trading strategy isn't actively doing anything – it's just waiting. 

Think of it as getting a notification whenever your strategy is idle, with no positions held and nothing scheduled.

The data you receive will include the current price, the symbol being traded, and information about your strategy, exchange, and data frame, but there won't be any signal data. This is perfect for things like tracking how often your strategy is idle, or generating simple log messages to show it’s still running.

Importantly, this notification only happens during backtests; it won't be triggered in live trading. This makes it a great way to analyze backtest results without getting mixed up with real-time data. You can dive directly into the idle events without needing to filter or check any conditions.

## Function listenSignalBacktestClosedPerSignal

This function lets you listen for when a backtest has finished generating results for a specific trading signal. It ensures you only receive each result once, even if the backtest runs multiple times.

Think of it as a way to track the completion of individual backtest runs for specific signals, preventing duplicate notifications. 

You provide a filter to select which closed events you're interested in, and a function to execute when a matching event occurs. This functionality is exclusive to backtest executions—it won't trigger during live trading. 

The system intelligently handles situations where multiple strategies run concurrently, making sure no signal's result is suppressed.


## Function listenSignalBacktestClosed

This function lets you listen for when a trading position closes during a backtest. 

It's specifically for analyzing past performance, not for live trading situations. 

Whenever a position closes—whether it's due to a take-profit order, a stop-loss, time expiration, or manual closure—this function will notify you. You'll get details like the reason for the closure, the exact time it happened, and the realized profit and loss, including fees and slippage. Once you receive an event, it’s final; no further updates will be sent for that particular signal. You don't need to check the event type because the data you want is already directly available.

## Function listenSignalBacktestCancelledPerSignal

This function lets you listen for specific events related to cancelled orders during backtesting. It's designed to handle situations where an order you placed during a backtest is cancelled.

The function ensures you only receive each cancellation event once, even if multiple cancellations occur related to the same signal. It's a safety measure to prevent redundant notifications.

It only works with backtesting data – it won't trigger during live trading.

You provide a filter to specify which cancellation events you're interested in, and a function to handle those events. The filter is applied *before* any deduplication occurs, so if your filter rejects an event, it’s never processed further. This guarantees that a later, similar event won't be blocked by a previously rejected one.


## Function listenSignalBacktestCancelled

This function lets you listen for situations where a trading signal was dropped during a backtest before it ever became an active trade. Think of it as hearing about signals that never made it to the execution phase.

You'll receive notifications when a signal is cancelled, letting you know the reason – maybe the price moved unexpectedly, or the wait time expired, or the user cancelled it. 

This is specifically for backtest scenarios; live trading won’t trigger this.

It's ideal for analyzing backtest results and generating reports without interference from live trading activity.

You provide a callback function that will be invoked with information about the cancelled signal, including a reason code and a cancellation ID if the cancellation was user-initiated.

## Function listenSignalBacktestActivePerSignal

This function lets you listen for specific events during backtesting, focusing on a single signal at a time. 

It's designed for one-off notifications – like knowing when a trade hits a certain profit level – because it only triggers once per signal.

The callback you provide will only run the very first time a position meets your criteria, then it won't alert again for that same trade.

You'll only receive these events from backtest runs, so it's safe for setting alerts that won’t accidentally go off during live trading.

If you’re running multiple strategies at once, each strategy will receive its own signals, preventing interference.

The `filterFn` you give lets you precisely target the events you're interested in; events that don't match this filter are ignored completely.


## Function listenSignalBacktestActive

This function lets you subscribe to updates during a backtest's execution, specifically when a trading position is open. You’ll get notified for each tick while a position is active, and each notification includes information about the current profit and loss, as well as the progress toward your take-profit and stop-loss levels. 

Think of it as a dedicated channel for analyzing backtest results – it's designed to avoid interference from live trading data. It’s intended for replay analysis and reporting that needs focused, backtest-specific information. The information delivered is highly detailed, so be prepared for a lot of data flowing through this connection. 

You only receive these notifications when using the `Backtest.run()` function. The callback you provide will be called with events containing the live profit and loss information and the progress toward the stop-loss and take-profit levels.


## Function listenSignalBacktest

The `listenSignalBacktest` function lets you tap into the flow of a backtest to receive updates as it runs. You provide a function that will be called whenever a signal event occurs during the backtest. This is useful if you want to react to what's happening in the backtest in real-time or process data as it becomes available. Importantly, this function only works with events generated during a `Backtest.run()` execution, and the events will be handled one after another to ensure the order of operations. It returns a function you can call to unsubscribe from these events later, making sure you stop receiving updates when you no longer need them.


## Function listenSignalActivePerSignal

This function lets you react to specific events as your trading strategy executes. It’s designed to notify you whenever a new signal becomes active, but only if a provided filter condition is met. Think of it as a focused alert system – you define what kind of active events you care about, and it will only trigger when those conditions are satisfied. Importantly, these events repeat for the entire time a position is open, so you'll only get the initial notification for each signal. To unsubscribe, the function returns a function that can be called to stop receiving these notifications.

## Function listenSignalActive

This function lets you react to what's happening in real-time while your trades are open, whether it's a live trading session or a backtest. It provides updates on your profit and loss (pnl), how close you are to your take-profit target (percentTp), and how close you are to your stop-loss level (percentSl).

Keep in mind that you'll receive an event for *every* tick for *each* open position, so it can generate a lot of data. If you want to consolidate those updates, look at `listenSignalActivePerSignal` instead—that will give you one update per position.

You provide a function as input, and that function will be called whenever a relevant event occurs, receiving the details of the active tick result.


## Function listenSignal

This function lets you react to different events happening during a trading simulation – things like when a strategy is idle, when a trade is opened, when it's actively running, or when a trade is closed. It ensures these events are handled one at a time, even if your reaction to them involves some asynchronous operations. Essentially, you provide a function that will be called whenever one of these events occurs, and this function will be executed in a controlled sequence to avoid potential conflicts. It returns a function that, when called, unsubscribes from these events.

## Function listenSchedulePingPerSignal

This function lets you react to schedule ping events, which happen every tick when a trading signal is waiting to be activated. Instead of getting flooded with pings, you'll receive a callback for each unique signal ID. 

You can use a filter function to choose which signals trigger the callback. The callback itself will then be executed with information about that specific signal. Think of it as a way to be notified when a signal is ready to go, but only once per signal.


## Function listenSchedulePingOnce

This function lets you set up a temporary listener for ping events. You tell it what kind of ping you’re looking for with a filter, and then provide a function to run when that specific ping arrives. Once that ping is received and handled, the listener automatically disappears, so you don’t have to worry about cleaning up. It’s perfect for situations where you need to react to a single, particular event.

The filter function determines if a ping event should trigger the callback. The callback function executes once when the filtered event is detected.


## Function listenSchedulePing

The `listenSchedulePing` function lets you keep an eye on scheduled signals as they wait to become active. It’s like setting up a listener that gets notified every minute while a scheduled signal is being monitored. This allows you to track its progress and run any custom checks or actions you need during that waiting period. You provide a function that will be called each time a "ping" event occurs, giving you the details about the signal. When you’re done, the listener can be unsubscribed.

## Function listenRiskOnce

This function lets you react to specific risk-related events, but only once. 

It's like setting up a temporary listener that waits for a particular condition to be met. Once that condition is met, your provided function will run, and the listener automatically disappears. This is helpful if you need to perform an action based on a risk event, and then you're done with it.

You provide a filter to specify exactly what kind of risk event you’re interested in, and then you provide a function that will be executed when that specific event happens. The function will be run just one time, then automatically unsubscribe.

## Function listenRisk

The `listenRisk` function lets you be notified whenever a trading signal is blocked because it doesn't meet the defined risk criteria.

Think of it as a way to get alerted only when something goes wrong with risk validation, rather than receiving updates for every single signal.

It ensures that these alerts are processed one at a time, even if your handling code takes some time to run, which helps prevent unexpected behavior.

You provide a function that will be called with details about the rejected signal each time a risk rejection occurs. The function returned by `listenRisk` can be used to unsubscribe from these events.

## Function listenPerformance

This function allows you to monitor how quickly your trading strategy is executing. It’s like having a detective watching over your code to pinpoint any slow parts. 

Whenever a significant operation happens within your strategy, the system will generate a performance event. You provide a function (named `fn`) that receives these events. 

The events are delivered one after another, ensuring a smooth and predictable flow of information, even if your event handling function takes some time to process them. This helps with identifying performance bottlenecks and optimizing your strategy's speed and efficiency.


## Function listenPauseOnce

This function lets you react to a pause event happening in your trading system, but only once. You provide a condition – a filter – that determines which pause events you’re interested in. When a pause event matches your condition, a function you specify will run just one time to handle it. After that single execution, the function automatically stops listening, so you don't need to worry about managing subscriptions. 

It’s useful for one-off tasks like resetting a strategy after a pause.

The first argument is how you decide which events to respond to. The second argument is what happens when an event meets your criteria.


## Function listenPause

This function lets you keep track of when a trading strategy is paused or resumed. It's great for things like sending notifications to users whenever a strategy is temporarily stopped or started again. The function works by listening for changes to the pause status of a strategy, handling events in the order they occur, and making sure that any actions taken are done one at a time to avoid conflicts. You provide a function that will be called each time the pause status changes.

## Function listenPartialProfitAvailablePerSignal

This function lets you keep a close eye on when partial profit levels are reached during backtesting. It's like setting up an alert system that tells you when a specific signal hits a certain profit milestone.

You'll provide a filter to select which alerts you want to receive, and a function to execute when an event occurs. 

Importantly, you'll only get the first profit level event for each signal ID, preventing duplicate notifications—unless you specifically want to see every level change. To track all levels for a given signal, use the more general `listenPartialProfitAvailable` function instead and handle the level tracking yourself.

## Function listenPartialProfitAvailableOnce

This function lets you watch for a specific condition related to partial profit levels and react to it just once. Think of it as setting a temporary alert – when the condition you define is met, the function will run your provided code and then stop listening. It’s really handy when you need to trigger something specific based on a profit target being reached, but only want to do it one time.

You'll provide a filter that determines which events trigger your reaction, and then a function that gets executed when that filter matches an event. This function automatically unsubscribes itself after the single execution, so you don’t have to worry about managing subscriptions.


## Function listenPartialProfitAvailable

This function lets you keep track of your trading progress as you reach specific profit milestones, like 10%, 20%, or 30% gains. It’s like setting up a notification system that tells you when you've hit these targets.

The beauty of it is that even if your notification process takes some time, the system ensures that events are handled one at a time, in the order they happen, preventing any potential issues from multiple notifications arriving simultaneously. This provides a reliable way to monitor your profitability step-by-step. You simply provide a function, and it will call that function whenever a partial profit target is achieved, giving you the data needed to react or log the event.


## Function listenPartialLossAvailablePerSignal

This function lets you keep an eye on when partial loss levels are triggered for your trading signals. It's like setting up a notification system—you provide a filter to specify which signals you're interested in, and a function that gets called whenever a new signal meets that filter and a partial loss level is reached. Be aware that if a signal has multiple matching partial loss levels, only the first one will trigger your callback; so, if you need to handle each level individually, make your filter very specific. This subscription can be stopped by returning a function that calls it.


## Function listenPartialLossAvailableOnce

This function lets you set up a listener that reacts to changes in partial loss levels, but only once. You provide a filter to specify the exact conditions you're looking for—like a specific amount or type of loss—and a function that will run when those conditions are met. Once the function executes, the listener automatically stops, ensuring it doesn’t keep running unnecessarily. 

It's handy for situations where you need to react to a particular loss event and then move on.

The `filterFn` defines what events the listener should respond to.
The `fn` is the action that happens when the filtered event occurs.
It returns a function that you can call to unsubscribe the listener manually if needed.

## Function listenPartialLossAvailable

This function lets you keep track of how much a trading strategy has lost along the way during a backtest. It’s like setting up an alert system that triggers when the loss reaches certain milestones, such as 10%, 20%, or 30% of the initial capital. 

The alerts are handled one at a time, ensuring they’re processed in the order they arrive, even if your alert logic involves some extra processing that takes time. This sequential processing avoids problems that could arise from multiple alerts running at the same time.

You provide a function that will be called whenever a partial loss milestone is reached, and that function receives information about the loss event. The function returns another function you can call to unsubscribe from these alerts later.

## Function listenOrderStop

This function lets you listen for events related to order stops – specifically, when an order stop check has finished and reached a terminal state. Think of it as a way to react to situations where an order stop might be removed or has failed repeatedly.

It works alongside another feature that keeps track of order progress; this function signals when that progress has concluded.

You’ll receive notifications when an order stop is deleted (meaning the order it was tied to is gone) or has failed too many times.  You’ll also know how many consecutive failures led to that terminal state.

Important: This function is only used during backtesting simulations and *never* triggers during live trading. Errors within your listening function won't halt the backtest process; they'll be logged instead.

To use it, you provide a function that will be called whenever a relevant event happens. If your function returns a promise, the processing will be done one after another.


## Function listenOrderSchedulePerSignal

This function lets you react to specific events related to trading signals that have been scheduled. It’s essentially a way to listen for changes related to signals.

You can use a filter to narrow down the events you're interested in – for example, only responding to signals that meet certain criteria. The provided callback function will then be triggered whenever a new signal is scheduled or canceled.

It automatically handles removing duplicate events based on the signal's ID, and you can easily differentiate between signals that have been scheduled and those that have been canceled by examining the event's action type. When you're done, you can unsubscribe from these events using the function it returns.


## Function listenOrderSchedule

This function lets you keep an eye on scheduled orders, those orders you set up to trigger when the price reaches a certain level. 

You’ll get notified when a scheduled order is created, meaning the system is now waiting for the market to hit that price target, and also when those scheduled orders are cancelled, for example if the price moved too fast or you manually cancelled them. 

Keep in mind this doesn't tell you when a scheduled order actually executes – that's handled by the regular signal events.

This is a core system process that the framework itself uses, so you’ll receive updates on *every* scheduled order, even ones that are already cancelled.

If you're building an exchange integration, it’s better to use the adapter hooks; this listener is primarily for things like logging or notifications. 

The callback you provide will be executed in the order the events occur, even if it's an asynchronous function.

## Function listenOrderReject

This function lets you be notified when an order is definitively rejected by the exchange – meaning it won't be retried. Think of it as a final confirmation that the order didn’t go through. It only triggers for serious rejection reasons, not temporary issues that the system automatically tries to fix.

It's like a notification channel; any errors you encounter while processing this information won’t affect how the system is working, and you can safely use it for things like sending messages or logging events.

You provide a function that will be called whenever an order rejection happens. This function can even return a promise, and the processing will be handled in a queued manner.  When you're done listening for these rejection events, you need to unsubscribe using the function that this function returns.


## Function listenOrderFill

This function lets you listen for when your orders are actually filled by the broker—meaning, the broker has confirmed the order was placed or executed. It's the definitive signal that something really happened with your order.

You'll get notified about three types of order fills: when a new position is opened (either filled immediately or scheduled as a resting order), and when an existing position is closed.

Because this is a notification, not a gate, any errors your code throws while handling these fills won't disrupt the backtest – they'll be logged and ignored. This makes it safe to use for sending notifications to external services, like telegram bots or audit trails.

The function takes a callback function as input, which will be executed whenever a fill event occurs. If your callback returns a promise, the processing will happen one after another.


## Function listenOrderContinue

The `listenOrderContinue` function lets you track the ongoing status of orders after an initial check. Think of it as a way to be notified about how orders are progressing – whether they're still considered active or if there were temporary issues that are being monitored. 

It works alongside the order-stop channel, providing updates on orders that haven't been definitively closed. You’ll receive notifications as long as the order signal remains viable and the checks continue.

This feature is only active during live trading; backtesting doesn't use it.  Any errors within your callback function won’t interrupt the main trading process, they'll be logged and handled internally.  If your callback returns a promise, the processing will be handled in a sequential manner.


## Function listenMaxDrawdownPerSignal

This function lets you monitor for maximum drawdown events, but specifically when those events relate to a new trading signal. It's like setting up an alert that only triggers when a new signal starts showing concerning drawdown behavior. 

The function uses a filter to determine which drawdown events you're interested in.  Only events matching this filter will be reported. 

Importantly, it prevents repeated alerts for the same signal – you'll only receive the *first* drawdown event for each signal ID, even if the drawdown worsens later. This helps avoid being overwhelmed with notifications about a single signal. The function returns a cleanup function that can be called to unsubscribe from the events.

## Function listenMaxDrawdownOnce

This function helps you react to specific max drawdown events, but only once. Think of it as setting up a temporary alert – it listens for drawdown events that meet your criteria, runs your code once when they happen, and then stops listening. You provide a filter to define what kind of drawdown events you're interested in, and a function to execute when that event occurs. It’s perfect for scenarios where you need to respond to a particular drawdown situation and then move on.

## Function listenMaxDrawdown

The `listenMaxDrawdown` function lets you keep an eye on when your trading strategy hits a new maximum drawdown. It's like setting up an alert that triggers whenever your losses reach a new low point. This function ensures that your response to these events happens one at a time, even if the handling involves some delay. This is especially helpful if you need to adjust your risk management based on how your strategy performs.

You provide a function (`fn`) that will be called whenever a new maximum drawdown is detected. This callback function receives information about the drawdown event.

The subscription can be cancelled by returning a function from `listenMaxDrawdown` that, when called, unsubscribes the listener.

## Function listenIdlePingOnce

The `listenIdlePingOnce` function lets you set up a listener that will only trigger once when a specific kind of "idle ping" event occurs. An idle ping is a signal indicating periods of inactivity. 

You provide a filter to identify the particular type of idle ping you're interested in, and then you give it a function that will run just once when a matching idle ping is detected. 

This listener automatically stops after that single execution, so you don’t need to worry about manually unsubscribing. The function returns a cleanup function that allows you to stop the listener before it fires.


## Function listenIdlePing

This function lets you be notified when the backtest kit is completely idle – meaning there are no signals currently being processed or scheduled. It's useful for tasks that should only run when everything else is quiet.

You provide a function that will be called whenever this idle state is detected. This function receives an `IdlePingContract` object, which contains information about the idle ping event.

The function you provide returns another function, which you can use to unsubscribe from these idle ping events later, so you stop receiving the notifications.


## Function listenHighestProfitPerSignal

This function lets you keep an eye on when a trading signal reaches its highest profit point. It's like setting up an alert that tells you when a signal has peaked in terms of profit.

The function filters these peak profit events based on a condition you provide. Once a signal reaches its highest profit and matches your filter, the function calls a callback you define, providing you with information about that signal.

Importantly, it avoids sending you the same alert repeatedly for a single signal – it only reports the very first peak profit it encounters for each signal.


## Function listenHighestProfitOnce

This function lets you set up a one-time alert for when a particular trading event with the highest profit occurs. You tell it what kind of event you're looking for using a filter – essentially, a rule that defines the event you want to catch. Once that event happens, it triggers a callback function you provide, and then automatically stops listening, so you only get notified once. It's great for reacting to very specific and important profit opportunities.

You provide two things: first, a filter to specify the events you want to monitor. Then, you give it a function to run when the event matches your filter. The function will only run once, and the subscription will automatically stop afterward.

## Function listenHighestProfit

This function lets you keep an eye on when a trading strategy hits a new peak in profit. It’s like setting up a notification system that tells you whenever the profit level increases. 

The function takes a callback – a piece of code you provide – that will be executed whenever a new highest profit is achieved.  Importantly, these notifications are handled one at a time, even if your callback function takes some time to complete, ensuring things don't get out of order. 

This is really useful if you want to track how your strategy is performing over time, or if you need to automatically adjust your trading based on how well it’s doing. To stop listening, the function returns a function you can call to unsubscribe.

## Function listenExit

This function lets you react to serious, unrecoverable errors that can halt the backtest-kit's processes. It's like setting up a safety net for situations where things go wrong and the system needs to stop.

You provide a function that will be called when a critical error occurs – this function receives the error object itself.

Importantly, these errors aren’t the kind you can recover from; they'll stop the ongoing backtest, live trading, or other background tasks.

The errors are handled one at a time, in the order they happen, even if your provided function does some asynchronous work. This ensures a consistent and predictable response to those critical errors.


## Function listenError

The `listenError` function lets you set up a listener that gets notified when your trading strategy encounters a recoverable error—think of it as a safety net for hiccups during the process. These aren't critical, show-stopping errors; they’re more like temporary setbacks like a failed API call. When one of these happens, the system will handle it and keep running, but you'll receive a notification via your callback function. To ensure things stay orderly, the error handling process is queued, so your callback function will always run one at a time, even if it's an asynchronous operation. Essentially, it provides a controlled way to address and log these minor errors without disrupting the overall trading flow.


## Function listenDoneWalkerOnce

This function lets you react to when a background process finishes, but only once.

You provide a filter to specify which completion events you’re interested in, and a function that will be executed when a matching event occurs.

After the callback is executed once, the subscription is automatically removed, preventing further calls. Think of it as setting up a single, temporary listener for completion events.


## Function listenDoneWalker

This function lets you monitor when background tasks within the trading framework finish processing. It’s like setting up a notification system for these tasks.

When a background task is done, a special event is triggered, and your provided function (`fn`) will be called.

Crucially, these events are handled one at a time, even if your callback function takes some time to complete, ensuring things stay orderly. This prevents issues that could arise from multiple callbacks running simultaneously.

The function returns another function that you can call to unsubscribe from these events, cleaning up your listeners when they are no longer needed.


## Function listenDoneLiveOnce

This function lets you react to when a background task finishes running within your backtest. It's designed to be simple – you provide a way to identify the specific completion you’re interested in, and a function to execute when it occurs. Crucially, it only runs your callback once and then stops listening, so it's perfect for actions you only need to take one time when a specific event happens. Think of it as a one-time notification system for background task completions.


## Function listenDoneLive

This function allows you to track when background tasks within your backtest finish running. 

It essentially listens for completion signals from the `Live.background()` function. 

Whenever a background task concludes, it will call a function you provide, ensuring events are handled one at a time to avoid any hiccups. This helps you keep track of the progress and state of your backtesting simulations. You'll receive a `DoneContract` object containing information about the finished task.


## Function listenDoneBacktestOnce

This function lets you listen for when a background backtest finishes, but only once. 

You provide a filter – a test that determines if the completed backtest is the one you're interested in. Then, you give it a callback function that will run just once when a matching backtest completes. After that single execution, the listener automatically stops listening, so you don't have to worry about managing it. It's a handy way to react to a specific backtest finishing without cluttering up your code with ongoing subscriptions.

## Function listenDoneBacktest

This function lets you be notified when a background backtest finishes running. 

It's like setting up a listener that gets triggered when the backtest is done. 

The important thing is that when the backtest finishes, the notification will be delivered in a reliable, sequential order, and it handles asynchronous callbacks without causing issues. To use it, you provide a function that will be called when the backtest completes, and this function will return a function that you can call to unsubscribe from the event.

## Function listenCheck

This function lets you keep an eye on your orders to make sure they're still active on the exchange. It’s like a health check for your positions.

It listens for "order-check" events, which happen every time a new market tick comes in while you're monitoring a signal. These events tell you if the order linked to that signal is still open.

You'll get two types of events: "active" for signals that have an open position and "schedule" for signals with pending order to be filled. The backtest simulation doesn't send "schedule" events.

If the check fails, it can be handled in two ways: a temporary error, like a network problem, is tolerated and the system keeps trying (up to a certain number of attempts) before giving up. A more serious error, like the order being deleted, causes the system to shut down.

## Function listenBreakevenAvailablePerSignal

This function lets you keep an eye on when breakeven conditions are met for specific trading signals. You provide a filter to narrow down which signals you're interested in, and then a function that will be called whenever a new signal satisfies that filter and its breakeven is reached. It's like setting up a notification system to be alerted about profitable signals. The function returns an unsubscribe function to stop listening to these events.


## Function listenBreakevenAvailableOnce

This function lets you set up a listener that only runs once when a specific breakeven condition is met. Think of it like setting a one-time alert – you define what condition you're waiting for, and when it happens, your code runs and then the listener stops listening.

It's particularly useful when you need to react to a particular breakeven trigger just once and then don't want to be bothered by it anymore.

You provide a filter function to specify the condition you're waiting for (like a specific breakeven level).

Then, you provide a callback function that will execute when that condition is met. After the callback runs, the listener automatically turns itself off.

## Function listenBreakevenAvailable

This function lets you keep an eye on when your trading strategy's stop-loss automatically moves to the original entry price – a point where your trade is no longer at risk of a loss. It's useful when you want to react to trades reaching this breakeven point.

The system will notify you whenever this happens, and it ensures that your reactions are handled one at a time, even if your response involves some processing time.

To use it, you simply provide a function that will be called whenever a breakeven event occurs, and the function will return a way to unsubscribe from these events later.

## Function listenBeforeStartOnce

This function lets you react to specific events that happen right before a backtest begins. Think of it as setting up a one-time action to perform once when a particular condition is met at the very start of a trading simulation. You provide a filter to identify which events you're interested in, and then a function that will run only once when that event occurs. After that one execution, the subscription is automatically removed, so it doesn’t interfere with subsequent backtests.

It’s a clean way to, for example, set initial parameters or perform a pre-check before a backtest starts, ensuring it only happens once per backtest run.


## Function listenBeforeStart

This function lets you hook into the very beginning of a trading strategy's run for a specific asset. Essentially, it allows you to execute a function right before a new strategy execution begins. 

It’s designed to handle asynchronous operations safely; any code you put inside your function will run one at a time, ensuring a controlled sequence of events. This is helpful for tasks that need to happen before the strategy kicks off, like setting up data or configuring initial conditions. To stop listening for these events, you can simply call the function that's returned by `listenBeforeStart`.


## Function listenBacktestProgress

This function lets you keep an eye on how your backtest is running. It sets up a listener that gets notified as the backtest progresses, specifically during the background processing phase. 

You provide a function that gets called whenever there’s an update. The important thing is that these updates happen one at a time, even if your provided function takes some time to execute, ensuring things don't get mixed up. 

Think of it as a way to get regular progress reports on your backtest. When you're done listening, you can unsubscribe using the function it returns.


## Function listenAfterEndOnce

This function lets you react to specific trading events that happen *after* a trade has finished, but only once. You provide a filter – a way to identify which events you're interested in – and a function that will run when a matching event occurs.  Once that function has run once, the subscription automatically stops, preventing further callbacks for that specific event type. This is helpful for tasks like confirming a trade closure or performing a single, immediate action after a trade completes.


## Function listenAfterEnd

This function lets you be notified when a trading strategy's execution for a particular asset is fully finished. Think of it as a signal that all the calculations and activity for that asset have concluded. It makes sure that any code you write to handle this signal runs one step at a time, in the order the events occurred, even if your code needs to do some asynchronous work. You provide a function that will be called when the "after end" event happens for each asset you're tracking. This is a useful way to perform cleanup or log information after a trading strategy has run its course.


## Function listenActivePingPerSignal

This function allows you to closely monitor specific trading signals. It sets up a listener that reacts only when a new signal appears. 

Think of it as a way to react to the very first time a particular trading condition is met. Once that condition is met, the listener becomes quiet and doesn’t react again for that same signal.

You provide a filter to specify which signals you’re interested in, and then a function that will be executed each time a matching signal becomes active. This is a great way to react to the initial activation of a strategy’s indicator.


## Function listenActivePingOnce

This function lets you react to specific active ping events just once and then automatically stop listening. Think of it as setting up a temporary alert – it waits for a condition you define, triggers an action when that condition is met, and then quietly goes away. You provide a filter to specify exactly which events should trigger the action, and then you give it a function that will be executed when the filter matches an incoming event. This is handy when you need to wait for something to happen and respond immediately, but don't want to keep monitoring forever.


## Function listenActivePing

This function lets you keep an eye on active trading signals. It’s designed to monitor events that happen every minute, letting you track the status of your signals and respond to changes as they occur.  Think of it as a way to automatically adjust your trading strategies based on the signals that are currently active.

The events are handled one at a time, even if the function you provide takes some time to process, ensuring things run in a predictable order. A special queuing system makes sure your processing steps don't interfere with each other, providing a reliable way to manage these events.

You provide a function that gets called whenever a new active ping event is detected – that function will receive the details of the event as an argument.  This subscription can be cancelled when it's no longer needed, returning a function that, when called, will unsubscribe the listener.


## Function listWalkerSchema

This function gives you a peek into all the different "walkers" that are currently set up in your backtest-kit system. Think of walkers as custom components that process data during a backtest.

It pulls together a list of these walkers and their configurations. 

This is really handy if you're trying to understand how your backtest is working, create tools to display walker information, or just generally debug your setup.


## Function listSweepSchema

This function lets you see all the different sweep schemas that are currently set up within your backtest environment. Think of it as a way to list all the pre-defined strategies or methods used for sweeping through data. It's helpful for checking your configuration, understanding what’s available, or even creating tools that automatically display these strategies. The result is a list of these sweep schemas, ready for inspection.


## Function listStrategySchema

This function helps you find out what trading strategies are currently set up and ready to be used within the backtest-kit framework. It essentially gives you a list of all the strategies you've added, allowing you to see their configurations and details. This can be very helpful for understanding your system, creating documentation, or building interfaces that dynamically show available strategies. Think of it as a way to catalog your strategies.


## Function listSizingSchema

This function lets you see all the sizing schemas that are currently set up in your backtest kit. Think of sizing schemas as rules for how much of an asset to buy or sell. 

It's a handy tool for checking your configurations, understanding how your trading logic works, or even building a user interface to manage these sizing rules.  The function returns a list of these sizing configurations.


## Function listRiskSchema

This function helps you see all the risk configurations currently being used in your backtest. Think of it as a way to take a peek at how your risk management is set up. It gathers all the risk schemas that you've added and presents them in a simple list. This is particularly handy if you're troubleshooting or want to understand your system’s risk profile.

## Function listMemory

This function helps you see all the stored memories associated with your trading signal. It's like looking through a record book of past decisions and data.

It automatically figures out which signal you’re working with and whether you’re in a testing or live trading environment.

You provide a bucket name, and it returns a list of memories, each containing an ID and the data itself. Think of it as retrieving specific entries from a labeled storage container.

## Function listMCPSchema

This function lets you see all the different data structures (called MCP schemas) that are currently being used within the backtest-kit system. It's like getting a directory of all the different kinds of data the framework understands. 

It’s particularly helpful if you're troubleshooting, creating documentation, or trying to build a user interface that needs to adapt to different data formats. The function returns a list of these schemas, allowing you to inspect and work with them programmatically.

## Function listFrameSchema

This function lets you see a complete inventory of all the data structures (called "frames") your backtest kit is using. It's like a catalog of the different types of data you're working with during your backtesting process. You can use this to check that everything is set up correctly, generate documentation, or even build tools that automatically adapt to the frames you're using. The function returns a list of these frame definitions, allowing you to inspect their details.

## Function listExchangeSchema

This function gives you a peek at all the exchanges that backtest-kit knows about. It returns a list of their schemas, basically outlining how each exchange is structured within the system. Think of it as a way to see all the possible connections and data sources you can use for your backtests. It's really handy for figuring out what's going on behind the scenes, creating helpful guides, or dynamically building user interfaces.

## Function hasTradeContext

This function simply tells you whether you're in a state where you can actually execute trades. It checks if both the execution context and the method context are running. Think of it as a quick check to see if it’s safe to use functions related to trade execution, like getting candle data or formatting prices. If this function returns `true`, you're good to go – if not, you may need to set up the necessary environments first.

## Function hasNoScheduledSignal

This function checks whether a scheduled trading signal currently exists for a specific trading pair, like 'BTC-USDT'. It returns `true` if no signal is scheduled, meaning it's safe to proceed with generating a new one. Think of it as a safety check before creating a signal – ensuring you don't accidentally create duplicates. The function adapts to whether you're running a backtest or a live trading session without you needing to specify. You provide the symbol, and it tells you if a signal is waiting to be executed.

## Function hasNoPendingSignal

This function, `hasNoPendingSignal`, checks if there's currently no pending trading signal for a specific symbol like 'BTCUSDT'. It's essentially the opposite of `hasPendingSignal`, and it’s designed to help you control when new signals are created. Think of it as a safety check: use it before trying to generate a new signal to make sure you don’t accidentally create conflicting instructions. It automatically adapts to whether your backtest is running in a simulated historical environment or in a live trading scenario. You just provide the symbol you're interested in, and it will tell you whether a pending signal exists.

## Function getWalkerSchema

The `getWalkerSchema` function helps you find information about a specific trading strategy, or "walker," within the backtest-kit framework. Think of it as looking up the blueprint for a particular trading approach. You provide the name of the walker you're interested in, and the function returns a detailed description of its structure and how it works. This is useful for understanding what a walker does and how its components are organized.

## Function getTotalPercentHeld

This function helps you understand how much of your initial position is still open, even if you’ve closed parts of it along the way. It gives you a percentage – 100% means you haven't closed any part of the position, while 0% signifies the entire position has been closed. The calculation considers any dollar-cost averaging (DCA) entries that have occurred since you started, making sure the result is accurate even with multiple partial closures.  Essentially, it's a way to track how much of your original trade is still active. You pass in the trading pair symbol to get the relevant data. It's the same as using `getTotalPercentClosed`.

## Function getTotalPercentClosed

This function tells you what percentage of your position is still open for a specific trading pair. It's a simple number between 0 and 100, where 100 means you haven't closed any part of your position and 0 means it's completely closed out.

It takes the trading pair's symbol as input, for example, "BTCUSDT".

The function takes care of figuring out whether it's running in a backtesting environment or a live trading environment automatically.

It handles situations where you’ve used dollar-cost averaging (DCA) and closed the position in smaller chunks, providing an accurate reflection of your current holdings.


## Function getTotalCostClosed

`getTotalCostClosed` helps you figure out how much money you've invested in a particular trading pair, like BTC/USD. It calculates the total cost basis of any open positions you currently hold.

The function considers any dollar-cost averaging (DCA) you've done – that is, when you've bought the same asset over time – and takes into account any partial closes you've made along the way to give you an accurate figure.

It automatically knows whether it's running in a backtesting simulation or a live trading environment.

You simply need to provide the symbol of the trading pair you're interested in, such as "BTC/USD".


## Function getTimestamp

This function provides a way to get the current timestamp within your trading strategies. Think of it as a reliable clock for your bot. 

It behaves differently depending on whether you're running a backtest (simulating past data) or live trading. 

During a backtest, it will give you the timestamp associated with the historical data point you're currently analyzing.  When you're trading live, it delivers the actual current time.

## Function getSymbol

This function allows you to retrieve the symbol you're currently trading, like "BTCUSDT" or "ETHUSD," directly from the environment your backtest or trading simulation is running in. It's a simple way to confirm which asset you're working with. The function returns a promise that resolves to the symbol as a string.

## Function getSweepSchema

This function lets you fetch the details of a specific trading simulation, or "sweep," that's been set up within the backtest-kit framework. Think of it as looking up the blueprint for a particular test run. You identify the sweep by its unique name, and the function returns a structured object describing how that sweep is configured – things like the data it uses and how it's analyzed. It's useful for understanding the settings of a backtest without actually running it.

## Function getStrategyStatus

This function lets you peek into what a trading strategy is doing right now within the backtest environment. It gives you a snapshot of the strategy's internal workings – things like signals that are waiting to be processed, actions that are queued up, and flags indicating user interactions. Think of it as a quick look at the strategy's current state during a simulation or live trade. You provide the symbol of the trading pair (like BTC-USDT), and it returns details about that strategy's status. It figures out whether you're running a backtest or live trading automatically.

## Function getStrategySchema

This function helps you find the blueprint for a specific trading strategy you've registered within the backtest-kit system. Think of it as looking up the detailed instructions for how a strategy is built and what it's supposed to do. You provide the strategy's unique name, and it returns a structured object describing that strategy – things like the expected inputs and outputs. It's useful when you need to understand or validate a strategy's structure programmatically.


## Function getStrategyPaused

This function lets you check if a trading strategy is currently paused. When a strategy is paused, it won't open any new trades – the `getSignal` function won't be triggered and any new trade requests are held. However, any existing trades or signals that are already in progress will still be managed and closed as usual. The system figures out whether it's running in a backtest or live trading environment automatically. You provide the symbol of the trading pair you're interested in to determine the paused status.


## Function getSizingSchema

This function helps you find the specific rules for determining how much of an asset to trade. Think of it as looking up a recipe for sizing your trades. You give it a name – a unique identifier for a sizing strategy – and it returns the detailed configuration for that strategy. This configuration tells the backtest kit exactly how to calculate the trade size based on various factors.

## Function getSignalState

The `getSignalState` function helps you retrieve a specific value associated with the currently active trading signal. It automatically figures out if you're running a backtest or a live trade, and it searches for either a pending or a scheduled signal. If it can't find one of those signal types, it will let you know.

This function is particularly useful for advanced trading strategies that use large language models (LLMs) and want to track metrics like how much a trade has gained or how long it's been open. The example given focuses on strategies that manage risk to stay profitable, avoiding large losses and aiming for modest gains, while also having an exit rule based on trade duration and peak profit.

You provide the trading symbol and a data transfer object (dto) to this function to work with.

## Function getSessionData

The `getSessionData` function lets you store and retrieve data that lasts throughout a trading session, even if your program restarts. Think of it as a place to hold information like the results of complex calculations or the state of an indicator that you need to remember across different candles or even across process restarts in live trading mode.  You provide a symbol, and the function will return the associated data if it exists, otherwise it returns null. This is great for things that need to be remembered, but aren't directly tied to a specific candle’s signal. The function automatically adjusts to whether it's being used in a backtest or a live trading environment.

## Function getScheduledSignal

This function lets you retrieve the scheduled signal that's currently in effect for a specific trading pair. It's like checking what the system is planning to do next based on a pre-defined schedule. If there's no signal scheduled, it won't return anything – it'll be like the system is waiting for the next instruction. The function intelligently figures out whether it's running a test backtest or a live trading session, so you don't have to worry about that. You simply tell it which trading pair (like BTC-USDT) you’re interested in, and it will return the relevant signal.


## Function getRuntimeInfo

This function helps you understand the context of your backtest or live trading. It fetches information like which asset you're trading, the exchange being used, the timeframe of your data, the strategy you've implemented, and crucially, whether you're running a backtest simulation or a live trade. This is handy for displaying information to the user or adapting your logic based on the environment.

## Function getRiskSchema

This function lets you fetch a specific risk schema that's already been set up within the backtest-kit framework. Think of risk schemas as blueprints for how you're managing risk in your trading strategy. To get a particular blueprint, you need to provide its unique name – this is what you pass as the `riskName` argument. The function will return all the details defined in that risk schema, allowing you to examine or use it in your backtesting process.

## Function getRemainingCostBasis

This function helps you figure out how much of a specific asset you still have remaining in your trading position, considering any partial sales you've made. It's a way to track the remaining cost basis – essentially, how much money is tied up in the portion of the asset you haven’t sold yet. 

It accurately accounts for situations where you’ve made multiple purchases (dollar-cost averaging) and then sold off parts of your holdings. Think of it as a more precise way to understand what’s left of your initial investment.

It's essentially the same as getting the total cost of assets that have already been sold.

You only need to provide the trading pair symbol (like "BTCUSDT") to get the remaining cost basis.

## Function getRawCandles

The `getRawCandles` function lets you retrieve historical candle data for a specific trading pair and timeframe. You can control how many candles you get and the date range they cover. 

The function is designed to avoid any potential bias in your backtesting results by respecting the current execution context.

Here’s how you can use it: You can specify a start date, end date, and the number of candles to fetch, or you can just provide a number of candles and it will use a default date range. If you only provide an end date and a limit, it will automatically calculate the start date. The function also validates that the end date you provide isn’t in the future.

Here's a breakdown of the parameters:

*   `symbol`: The trading pair you're interested in, like "BTCUSDT."
*   `interval`:  The timeframe for the candles, like "1m" for one-minute candles or "1h" for one-hour candles.  Valid options are "1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", and "8h".
*   `limit`:  The maximum number of candles you want to retrieve.
*   `sDate`: The starting date for the candles, in milliseconds.
*   `eDate`: The ending date for the candles, in milliseconds.


## Function getPositionWaitingMinutes

This function helps you check how long a trading signal has been waiting to be executed. It tells you the number of minutes a signal has been scheduled but not yet activated. 

If there isn't a scheduled signal for the specified trading pair, the function will return null. 

You provide the trading pair symbol (like "BTCUSDT") to find out the waiting time.

## Function getPositionPnlPercent

This function helps you understand how profitable your open trades are right now. It calculates the unrealized profit or loss as a percentage, taking into account things like how much you’ve already closed, any average cost prices you've set, potential slippage, and fees. 

It works for both backtesting and live trading environments without you needing to specify which one. The function also automatically retrieves the current market price needed for the calculation. 

You'll need to provide the trading pair symbol, like "BTCUSDT," to get the percentage. If there’s no open trade currently being managed, the function will let you know with an error.

## Function getPositionPnlCost

This function helps you understand how much profit or loss you're currently holding on a trade. It tells you the unrealized PNL – the potential gain or loss if you were to close your position right now – expressed in dollars.

The calculation takes into account a lot of details, including the percentage change in price, the total amount invested, any partial closes you've made, and even slippage and fees. 

If you don’t have an active trade, the function will let you know. It works seamlessly whether you’re running a backtest or a live trading strategy, and it automatically gets the current price for accurate calculations. To use it, you just need to provide the symbol of the trading pair, like "BTCUSDT".

## Function getPositionPartials

This function lets you peek at the partial profit or loss closures that have happened for a particular trading pair. Think of it as looking at a history of how you've chipped away at a larger position.

It returns a list of events, each detailing a partial close – whether it was for profit or loss.

Each entry tells you the percentage closed, the price at which it happened, the cost basis at that time, and the number of times you'd added to your position.

If you haven’t executed any partial closures yet, you'll get an empty list back. If you try to check a trading pair with no open signal, the function will let you know with an error. You provide the trading pair symbol as input.


## Function getPositionPartialOverlap

This function helps you avoid accidentally closing out parts of your positions multiple times at roughly the same price. It checks if the current market price is close enough to a previously executed partial close price. 

Essentially, it looks at your existing partial close orders and calculates a range around their prices, based on configurable percentages. If the current price falls within that range, the function returns true, indicating you should probably hold off on another partial close at that level. If no partial closes have been executed yet, or if the current price is far from any existing ones, it returns false. You can adjust the size of this range using the `ladder` parameter to control the sensitivity of the check.

## Function getPositionMaxDrawdownTimestamp

This function helps you understand the history of a specific trade. It tells you exactly when a position experienced its biggest loss – essentially, the timestamp of its maximum drawdown. You provide the symbol of the trading pair (like "BTC-USDT"), and it returns a timestamp indicating that point of maximum loss. If there's no recorded trading activity for that symbol, the function won't work and will let you know.

## Function getPositionMaxDrawdownPrice

This function helps you understand the maximum drawdown a specific trading position experienced. It tells you the lowest price the position reached while it was open, essentially showing you the biggest loss it incurred. To use it, you simply provide the symbol of the trading pair you're interested in, like "BTCUSDT."  If there isn't a signal associated with that position, the function will let you know by throwing an error.


## Function getPositionMaxDrawdownPnlPercentage

This function helps you understand how much your trading position lost at its lowest point. It calculates the percentage of profit or loss experienced when the price reached its most unfavorable level throughout the entire time the position was open. You provide the trading pair symbol, and the function returns a number representing that percentage drawdown. If there's a problem, like a missing trading signal, the function will let you know.

## Function getPositionMaxDrawdownPnlCost

This function helps you understand how much money you lost at the point your position hit its lowest value. It calculates the PnL cost – essentially the financial hit – expressed in the same currency as the traded asset. You'll need to specify the trading symbol (like "BTC-USD") for which you want this information. If there are no trading signals currently, the function will let you know.

## Function getPositionMaxDrawdownMinutes

This function lets you check how long ago a position experienced its biggest loss. It tells you the number of minutes that have passed since the point where the position was at its lowest value. The value will be zero if the worst loss occurred just now. If there isn't a signal associated with the position, the function will indicate an error. You need to provide the trading symbol, like "BTCUSDT", to use this function.

## Function getPositionLevels

This function, `getPositionLevels`, helps you see the prices at which you've bought into a trade. It gives you a list of prices, starting with the initial price when the trade was started and including any additional prices if you've used the commitAverageBuy function to add more buys later.

If no trade is currently in progress, it will tell you that something is missing. 

If you haven't added any more buys after the initial one, you'll get an array containing only the original price.  You just need to provide the trading pair symbol, like 'BTCUSDT', to use this function.


## Function getPositionInvestedCount

getPositionInvestedCount tells you how many times you've added to a position using a DCA strategy for a specific trading pair. It essentially counts the DCA entries made after the initial buy. A value of 1 means it's just the original purchase, while higher numbers indicate subsequent DCA buys. If you haven't started a DCA, this function will let you know, and it works seamlessly whether you're running a backtest or a live trading session. You just pass in the symbol of the trading pair you're interested in.

## Function getPositionInvestedCost

This function helps you figure out how much money you've invested in a particular trade. It calculates the total cost of buying the assets for a position that's currently being set up.

Essentially, it adds up all the individual costs associated with each purchase made to build that position. These costs are usually determined when you initially set up the trade.

If there's no trade being prepared, the function will let you know that it can't calculate the cost. It automatically adapts to whether you're running a test backtest or a live trade.

You just need to provide the trading pair symbol, like "BTCUSDT," and the function will return the total invested cost in dollars.


## Function getPositionHighestProfitTimestamp

This function helps you find out when a specific trading position achieved its highest profit. It looks at a particular trading pair, like "BTCUSDT," and tells you the exact timestamp—a date and time—when the profit was at its peak. If there isn't a record of a trading signal for that pair, the function will let you know by throwing an error. Essentially, it's like looking back at a position’s history and pinpointing its most profitable moment.

## Function getPositionHighestProfitPrice

The `getPositionHighestProfitPrice` function helps you find the highest price your current trade has reached while being in profit. 

It starts by remembering the price when you first opened the trade. 

Then, it constantly updates itself: for long positions, it looks for the highest price above your entry price; for short positions, it looks for the lowest price below your entry price. 

You provide the trading pair symbol (like "BTCUSDT") to the function, and it returns a number representing that highest profit price. You'll always get a value, even if it's just the initial entry price – the function won't return nothing.


## Function getPositionHighestProfitMinutes

This function helps you understand how long a trading position has been operating below its peak profit. It tells you the number of minutes that have passed since the price reached its highest point for that particular trading pair. Think of it as a way to measure how far a position has fallen from its most profitable moment – it's essentially the same as checking how long it's been in a drawdown. If you call this function and there are no active trading signals, it will raise an error. To use it, you need to provide the symbol of the trading pair you're interested in, like "BTCUSDT".

## Function getPositionHighestProfitDistancePnlPercentage

This function helps you understand how far your position is from its best performance. 

It calculates the difference between the highest profit percentage achieved so far and the current profit percentage, but only considers positive differences (so it will never be a negative number).

Essentially, it tells you how much room there is for potential gains based on past performance.

You need to provide the trading symbol (like "BTC-USDT") to get the information for that specific asset. If no trades have been made, the function will report an error.


## Function getPositionHighestProfitDistancePnlCost

This function helps you understand how far your current trading position is from its potential peak profit. It calculates the difference between the highest profit achieved so far and the current profit, but only considers positive differences (meaning it ignores losses). 

Essentially, it shows you how much more room there is for your trade to grow before it reaches its best performance.

To use it, you provide the trading symbol (like "BTC-USDT"). 

Keep in mind that it requires active trading signals; if there are none, it will report an error.

## Function getPositionHighestProfitBreakeven

This function helps determine if a trade could have reached a breakeven point after hitting its highest potential profit. It checks if the math worked out so that the trade could have become profitable and then returned to the original price. 

It requires that there be a pending signal for the specified trading pair (symbol). If no signal exists, it will raise an error.

You provide the trading pair symbol, like "BTCUSDT", and the function will tell you whether breakeven was mathematically possible at the highest profit price.

## Function getPositionHighestPnlPercentage

This function helps you understand how well a specific trade has performed. 

It looks at a past position for a particular trading pair, like 'BTC-USDT', and tells you the highest percentage profit it ever reached. 

Essentially, it shows you the peak profitability of that trade. 

If there isn't a signal for the trade, the function will let you know.


## Function getPositionHighestPnlCost

This function helps you understand the financial performance of a specific trading position. It calculates and returns the cost associated with achieving the highest profit price that position ever reached. Essentially, it tells you how much it cost to reach that peak profit. 

You provide the trading pair symbol (like BTC-USDT) to identify the position you're interested in. 

It's important to note that this function won't work if there isn't an active signal for that symbol.


## Function getPositionHighestMaxDrawdownPnlPercentage

This function helps you understand how much your trading position has recovered from its biggest loss. It calculates the percentage difference between your current profit and loss and the lowest point of loss experienced during the trading period. Essentially, it shows you the distance your position has traveled back up from its worst drawdown.

You provide the trading symbol (like 'BTC-USDT') to specify which position you're interested in. 

Keep in mind, this function won't work if there aren't any pending trading signals for that symbol.

## Function getPositionHighestMaxDrawdownPnlCost

This function helps you understand how much your trading position has lost compared to its lowest point. It figures out the difference between your current profit and loss and the biggest drop you've experienced. 

Essentially, it tells you how far your position has fallen from its peak and how much it would need to recover to break even. 

To use it, you just need to provide the trading pair symbol, like 'BTC-USDT'. 

It throws an error if there aren't any pending trade signals.


## Function getPositionEstimateMinutes

This function helps you understand how long a trading position is expected to last. It gives you an estimate in minutes, based on the initial plan set when the trade was triggered. Think of it as the original timeline for the trade.

If there isn't an active trade currently being managed, the function will let you know by throwing an error. You provide the symbol of the trading pair, like 'BTCUSDT', to get the estimate for that specific trade.


## Function getPositionEntryOverlap

getPositionEntryOverlap helps you avoid accidentally making multiple DCA entries at roughly the same price. It checks if the current market price is close enough to any of your existing DCA entry levels, within a defined tolerance. If the current price falls within that tolerance zone for any existing level, it means you shouldn't enter another DCA at that price. 

The function returns `true` if the current price is too close to an existing entry, and `false` if no entries exist or the price is far enough away. You can also customize the tolerance zone by providing a `ladder` configuration to define how much leeway is allowed around each entry level. It’s essentially a safety net for your DCA strategy.


## Function getPositionEntries

getPositionEntries lets you check the history of how your current trading position was built, specifically focusing on any dollar-cost averaging (DCA) entries. It gives you a list detailing the price and cost associated with each step, whether it was the initial purchase or a later DCA commit. If you haven't made any DCA entries, you'll get a list with only the original position details. This function requires a pending signal to exist and will let you know if one isn't available. You need to provide the symbol (like BTCUSDT) to retrieve the information for that specific trading pair.

## Function getPositionEffectivePrice

This function calculates the effective price at which you entered a position, considering any dollar-cost averaging (DCA) that might have occurred. 

It figures this out by averaging your costs, taking into account the prices at which you bought.

If you've partially closed your position, it factors in those partial closures to get a precise blended price. 

If you haven't used DCA, it simply returns the original entry price.

Keep in mind that it requires a pending signal to work and will let you know if one isn't present. The function automatically adjusts its behavior based on whether you're in a backtest or a live trading environment.

You provide the symbol of the trading pair (like BTCUSDT) as input.

## Function getPositionDrawdownMinutes

getPositionDrawdownMinutes tells you how long, in minutes, a trading position has been losing ground since it reached its highest profit. It essentially tracks how far the price has moved away from the peak profit point. If the position is still at its highest profit, this value will be zero. It increases steadily as the price declines without a new high being achieved. You'll need an active trading signal to use this function; otherwise, it will report an error. The `symbol` parameter identifies the specific trading pair you want to examine.

## Function getPositionCountdownMinutes

This function tells you how much time is left before a trading position expires. It calculates this by looking at when the position was initially flagged for potential expiration and comparing it to an estimated expiration time.

The result is always a positive number of minutes – if the estimated expiration has already passed, it returns zero.

If there's a problem, like the system not recognizing the trading pair, the function will let you know by throwing an error.

To use it, you simply provide the trading symbol (like "BTC-USDT") to get the countdown.

## Function getPositionActiveMinutes

getPositionActiveMinutes helps you figure out how long a specific trade has been open. It returns the number of minutes, giving you a sense of the trade’s duration.

To use it, you'll need to provide the symbol of the trading pair, like 'BTC-USDT'.

If something goes wrong and the system can’t find the necessary information to calculate this, it will let you know with an error.

## Function getPendingSignal

This function helps you find out what signal your trading strategy is currently waiting on. It's like checking if your strategy has a plan to buy or sell something. 

It looks for a "pending signal," which means a signal that's been generated but hasn't been acted upon yet. 

If there’s nothing waiting, it will tell you by returning a null value. 

You simply need to provide the trading pair's symbol (like "BTCUSDT") to find the pending signal for that specific pair. The function intelligently knows whether it’s running a test or a real-time trading scenario.

## Function getOrderBook

This function retrieves the order book data for a specific trading pair, like BTCUSDT. 
It pulls this information from the exchange you're connected to. 
You can optionally specify how many levels of depth you want in the order book – if you don't provide a number, it will default to a maximum depth. 
The function takes into account the current time when fetching the data, which is important for accurate backtesting or real-time trading.

## Function getNextCandles

This function helps you retrieve future candles for a specific trading pair and time interval. It’s designed to get candles that come *after* the current point in time of your backtest or strategy execution.

You provide the symbol (like "BTCUSDT"), the candle interval (like "1h" for one-hour candles), and the number of candles you want to fetch.

The function then uses the underlying exchange's method to fetch those future candles and returns them as an array of candle data objects.


## Function getMode

This function tells you whether the backtest-kit is currently running a simulation (called "backtest") or is connected to a live trading environment. It returns a simple indicator: either "backtest" or "live". This is useful for adapting your code based on the environment it's running in.

## Function getMinutesSinceLatestSignalCreated

This function helps you determine how long ago the last trading signal was generated for a specific trading pair. It calculates the time in minutes, providing a simple way to track signal frequency. 

It doesn’t care whether that signal is still active or already finished; it just looks at the last one recorded. This is helpful, for example, if you want to enforce a cooling-off period after a stop-loss is triggered.

The function checks both your historical backtest data and potentially live data to find the most recent signal, and will let you know if no signals exist for that trading pair. It also adapts to whether you're running a backtest or live trading.


## Function getMaxDrawdownDistancePnlPercentage

This function helps you understand the risk profile of your trading strategies. It calculates the maximum drawdown, essentially the biggest drop from a peak profit to a trough loss, expressed as a percentage. 

Think of it as measuring how far your profits could have fallen from their highest point – a crucial metric for assessing potential risk. 

The function takes a trading symbol (like BTC/USD) as input and returns a numerical value representing that maximum drawdown percentage. If your strategy hasn't generated any signals yet, it will let you know by throwing an error.


## Function getMaxDrawdownDistancePnlCost

This function helps you understand how risky a trading strategy has been. It calculates the difference between the highest profit achieved and the largest loss encountered during a backtest.

Essentially, it's a measure of how far a strategy's performance could have fallen from its peak. 

The result is always zero or positive, because the calculation ensures any negative difference is ignored.

To use it, you provide the trading pair symbol, and it returns a number representing this drawdown distance in profit and cost terms. 

If the backtest didn't generate any trading signals for that symbol, the function will let you know with an error.


## Function getMCPSchema

The `getMCPSchema` function helps you access the defined structure for a specific Model Context Protocol, or MCP. Think of an MCP as a standardized way different parts of your backtesting system communicate.

You provide the name of the MCP you're interested in, and this function returns the detailed blueprint – the schema – that describes what data it uses and how it's organized. This allows your code to interact correctly with the MCP.

It’s essentially a lookup tool to get the specifications for a particular MCP.

## Function getLatestSignal

This function helps you find the most recent trading signal – whether it’s still active or has already closed – for a specific trading pair. 

It’s handy if you need to pause trading temporarily, like after a stop-loss is triggered, by checking when the last signal occurred.

The function looks for this signal data first in your backtest history, and then in the live trading data if it’s not found in the history. If no signal data exists, the function will let you know. It figures out whether it’s running in backtest or live mode automatically, so you don't have to worry about that.

You only need to provide the trading pair symbol (like BTCUSDT) to use the function.


## Function getFrameSchema

This function lets you look up the structure of a specific frame within your backtest. Think of it as asking, "What data will be available in this particular frame type?" You provide the frame's name, and it returns a definition outlining the data it contains. It’s useful if you need to understand the layout of the data you're working with during your backtesting process.

## Function getExchangeSchema

This function helps you get the details of a specific trading exchange that's been set up within the backtest-kit system. Think of it as looking up the blueprint for how that exchange works – what assets it offers, how orders are placed, and so on. You tell it the name of the exchange you're interested in, and it returns a structured description outlining its capabilities and behavior. This is useful for understanding how the backtest kit will interact with different exchanges during simulations.


## Function getDefaultConfig

This function provides a set of default settings for the backtest kit. It returns a configuration object containing various parameters controlling the behavior of the framework, such as candle fetching limits, retry attempts for order placement, maximum numbers of signals and notifications, and whether certain features like DCA or short signals are enabled. It’s helpful to examine these default values to understand the available configuration options and how they influence backtesting and trading processes.

## Function getDefaultColumns

This function provides a starting point for setting up the columns displayed in your backtest reports. It returns a predefined set of column configurations, including those for closed trades, heatmap data, live ticks, partial fills, breakeven events, performance metrics, risk events, scheduled events, strategy events, synchronization events, highest profit events, maximum drawdown events, walker P&L data, and walker strategy results. Think of it as a template to understand what columns you can choose from and how they’re initially set up. You can then adapt this default configuration to suit your specific reporting needs.

## Function getDate

This function, `getDate`, provides a way to retrieve the current date within your trading strategies. It’s useful for time-sensitive decisions, like scheduling actions or adjusting parameters based on the date.  The date you receive will depend on the mode you're running in: during backtesting, it represents the date of the specific historical timeframe you're analyzing, while in live trading, it's the current real-time date. Essentially, it gives you the date relevant to your trading context.


## Function getContext

This function provides a way to access information about the current trading method's environment. Think of it as a window into how the method is running – it reveals details like the data available and the overall state of the backtest. It returns a promise that resolves to a context object, letting you understand the surroundings of your code within the backtest process.

## Function getConfig

This function allows you to view the current settings that control how the backtesting framework operates. It provides access to numerous parameters that influence things like data fetching, signal generation, order execution, reporting, and more. Think of it as a peek under the hood to understand the default behaviors or to verify how specific settings are configured. The returned values represent a snapshot of the settings, so changes made directly to these values won't affect the system's actual configuration.

## Function getColumns

This function lets you see what columns are set up for your backtest reports. 

Think of it as peeking at the blueprint of how your data will be displayed.

It gives you a snapshot of all the column configurations, including ones for performance metrics, risk analysis, schedule details, and more. 

Importantly, the copy it provides won't change the actual column settings – it's just for viewing.

## Function getClosePrice

This function allows you to easily retrieve the most recent closing price for a specific trading pair and time interval. Think of it as a quick way to see how a particular asset performed over a defined period, like the last 5 minutes or the last hour. You simply tell it which asset you're interested in (like BTCUSDT) and how often you want the data (every minute, every 30 minutes, etc.), and it will return the closing price from the most recent candle. This is useful for understanding recent price action and informing trading decisions.


## Function getCandles

This function retrieves historical price data, presented as candles, from a connected exchange. You provide the trading pair you're interested in (like BTCUSDT), the time interval for the candles (ranging from 1 minute to 8 hours), and how many candles you want to retrieve. The function automatically fetches these candles starting from the current time. It’s a core tool for understanding past price movements and building trading strategies.


## Function getBreakeven

This function helps you determine if a trade has become profitable enough to cover its costs. It looks at the current price of a trading pair and compares it to a calculated breakeven point, which factors in slippage and trading fees. If the price has moved sufficiently in a positive direction, the function returns true, indicating the breakeven point has been surpassed. It doesn't matter whether you're running a backtest or a live trade - the function adapts automatically. You provide the symbol of the trading pair and the current price as input.

## Function getBacktestTimeframe

This function lets you find out the dates included in a backtest for a specific trading pair, like BTCUSDT. It's a simple way to see exactly which historical data your backtest is using. You provide the symbol of the trading pair, and it returns an array of dates representing the timeframe. This allows you to verify that your backtest covers the intended period.

## Function getAveragePrice

This function helps you find the Volume Weighted Average Price (VWAP) for a specific trading symbol, like BTCUSDT. 

It looks at the last five one-minute candles to figure this out. 

Essentially, it calculates a typical price for each candle and then weighs it by the trading volume during that time. 

If there’s no trading volume available, it will just calculate the simple average of the closing prices instead. 

You just need to provide the trading symbol you are interested in.

## Function getAggregatedTrades

This function allows you to retrieve historical trade data for a specific trading pair, like BTCUSDT. It pulls this information directly from the connected exchange.

You can request a certain number of trades using the `limit` parameter, or if you leave it out, it will fetch trades from a recent timeframe. The function automatically handles fetching older trades in batches until it has enough to satisfy your request.

## Function getActionSchema

This function helps you find the details of a specific action within your backtest kit setup. Think of it like looking up a recipe – you give it the name of the action (like "buy" or "sell"), and it returns a description of what that action does, including the data it expects and any rules it follows. It's useful when you want to understand how an action is configured or to dynamically generate user interfaces based on the available actions. You need to know the exact name of the action you're looking for.

## Function formatQuantity

This function helps you display the correct quantity of an asset for trading, making sure it adheres to the specific rules of the exchange you're using. It takes the trading pair symbol, like "BTCUSDT," and the raw quantity value as input. The function then uses the exchange's specific logic to format the quantity correctly, which often involves handling the right number of decimal places. Ultimately, it returns a formatted string representing the quantity ready for display or submission.

## Function formatPrice

This function helps you display prices in the correct format for a specific trading pair. It takes the symbol of the trading pair, like "BTCUSDT", and the raw price value as input. It then uses the rules of the exchange where that pair is traded to format the price accurately, ensuring the correct number of decimal places are shown. This simplifies presenting price data in a way that aligns with how the exchange displays it.


## Function dumpText

The `dumpText` function allows you to record raw text data, associating it with a specific bucket and a unique identifier. Think of it as a way to log textual information related to a trading signal, allowing you to examine the context around important events. 

It’s designed to work seamlessly within the backtest-kit framework; it figures out whether you’re running a backtest or a live trading session automatically. 

You provide the function with the bucket name, dump ID, the actual text content, and a description that explains what the text represents. The function then handles the saving and association with the current signal.


## Function dumpTable

The `dumpTable` function helps you display data in a structured table format, like a spreadsheet, within your backtest or trading environment. It takes an array of objects (your data) and turns them into a readable table.  It intelligently figures out which signal to associate the table with, and adapts to whether you’re running a backtest or a live trading session. The table's column headers are generated automatically based on all the different properties found within your data objects, so you don’t have to define them manually.  You provide the function with the table's name, a unique identifier, the data rows, and a brief explanation of what the table represents.


## Function dumpRecord

The `dumpRecord` function lets you save a record of data, like a snapshot of your trading activity, associated with a specific bucket and a unique identifier. It’s helpful for debugging or auditing purposes.

This function automatically figures out which signal to attach the record to, whether it's a signal already in progress or one that's scheduled for later. 

It also knows whether it's running in a backtesting environment or a live trading setup, adjusting its behavior accordingly.

You provide the function with a record containing key-value pairs, a bucket name, a dump ID, a description and it will persist this information.


## Function dumpMCPStatus

This function helps you create a snapshot of your Model Context Protocol (MCP) data, essentially a record of the state of your system at a specific moment. It automatically figures out which trading signal is active and whether you're in a backtest or live environment.

When using the standard markdown output, images within the MCP data will be extracted and saved as individual PNG files, and the entire MCP snapshot will be written to a markdown file, with images linked within the text.

There are also options to silence the dump entirely or create a simplified, text-only version for easier searching. You provide a data transfer object containing the bucket name, a unique identifier for the dump, the messages themselves, and a descriptive label.

## Function dumpJson

The `dumpJson` function lets you output a JSON object as a formatted block of text, associating it with a specific signal within your trading strategy. Think of it as a way to record detailed information about a particular moment in time during your backtest or live trading. It handles the complexities of figuring out whether you’re running a backtest or a live session, and automatically resolves any pending or scheduled signals for you, simplifying the process.  You provide the function with the signal's bucket name, a unique dump identifier, the JSON data you want to record, and a descriptive label for the dump.


## Function dumpError

This function lets you record and save detailed error information related to specific trading signals. Think of it as a way to create a digital breadcrumb trail when something goes wrong during a backtest or live trade. It automatically links the error report to the particular signal being processed and determines whether you're running a simulation or a real-time trading scenario. The function takes a set of details including the bucket name, a unique dump ID, the error content itself, and a short description for context. It then sends this information for storage and analysis.


## Function dumpAgentAnswer

This function helps you save a detailed record of an agent's conversation. It's like creating a snapshot of the entire interaction, including all the messages exchanged. 

You provide the function with information about where to store this snapshot (bucket name and a unique ID), the messages themselves, and a brief description of the data. 

The function intelligently handles knowing whether it's in a backtesting environment or a live trading scenario, and automatically associates the snapshot with the current signal being processed. It's a convenient way to preserve the complete agent conversation for review or debugging.

## Function createSignalState

The `createSignalState` function helps you manage and track the state of your trading signals in a structured way. It generates a pair of functions, `getState` and `setState`, which let you access and update the signal's information. 

The cool part is that it automatically figures out whether you're in backtesting or live trading mode, so you don’t need to pass extra information. This is particularly useful for more advanced strategies, like those using large language models to react to market conditions and build up data over multiple trades. 

Imagine needing to keep track of things like how long a trade is open or its maximum profit – this function makes that easy to do. It's designed to help build resilient strategies that can handle drawdowns and reach for gains.


## Function commitTrailingTakeCost

This function lets you manually set a specific take-profit price for a trade. It's designed to simplify setting a fixed take-profit level instead of relying on a percentage shift from the original take-profit distance. The system will handle the details of calculating the necessary percentage shift and automatically retrieve the current price to make the adjustment. You just need to provide the symbol of the trading pair and the desired take-profit price. It works the same way whether you're running a backtest or a live trade.


## Function commitTrailingTake

This function lets you fine-tune your trailing take-profit orders for existing signals. It adjusts how far your take-profit is from your initial entry price, based on a percentage shift.

It's important to remember that the adjustment is always calculated from the original take-profit distance, not the current trailing one, so your adjustments stay consistent.

If you're making repeated adjustments, the system will only update your take-profit if the new value is *more* conservative – meaning closer to your entry price. For long positions, this means moving the take-profit down; for short positions, it means moving it up.

The function intelligently knows whether it's running in a backtest or a live trading environment.

You'll need to provide the symbol of the trading pair, the percentage adjustment you want to apply, and the current market price.

## Function commitTrailingStopCost

This function lets you change the trailing stop-loss for a trading pair to a specific price. It's a handy shortcut that figures out the percentage shift needed based on the original stop-loss distance.

The system will automatically determine whether it's running in a backtest or live environment and will also automatically get the current price to calculate the new stop-loss.

You’ll need to provide the symbol of the trading pair and the new absolute price you want the stop-loss to be set at. The function returns a promise that resolves to a boolean indicating success or failure.


## Function commitTrailingStop

This function lets you fine-tune the trailing stop-loss for a trading signal that's already waiting to be triggered. It's designed to adjust the stop-loss distance as the price moves, helping to protect your profits.

Crucially, the calculation always references the *original* stop-loss level you set, not any adjustments already made by the trailing stop. This ensures your calculations are consistent and avoid compounding errors.

Think of `percentShift` as a nudge – a positive value pushes the stop-loss further away, while a negative value brings it closer to your entry price. However, the system only updates the stop-loss if the new adjustment offers better protection.

For long positions, the stop-loss will only move upwards, and for short positions, it only moves downwards. The closer to the entry the better! 

It intelligently figures out whether you're in a backtesting environment or live trading, so you don’t have to worry about that.




The function needs the trading symbol, the percentage adjustment you want to apply, and the current market price to evaluate.

## Function commitSignalNotify

This function lets you send out informational messages related to your trading strategy. Think of it as a way to leave notes or trigger alerts about what your strategy is doing, without actually changing your positions. It's perfect for things like logging when a specific indicator hits a certain level or signaling that an unusual volume event occurred. 

The function handles a lot of the setup for you – it knows whether you're in backtesting or live trading, and it automatically pulls information like your strategy name, the exchange you're using, and the current price. You just need to tell it which trading pair the notification is about and optionally add any extra details you want to include.

## Function commitPartialProfitCost

This function lets you automatically close a portion of your trading position when you've reached a specific profit level, measured in dollars. It simplifies the process by handling the conversion from a dollar amount to the necessary percentage of your invested cost. 

Essentially, you tell it how much money you want to take as profit, and it figures out how much of the position needs to be closed to achieve that.  

To use it, you just provide the symbol of the trading pair and the dollar amount you want to take as profit. It's designed to work whether you're backtesting or live trading and will get the current price for you. Remember, the price must be moving in a direction that would bring you closer to your take profit target for this to work correctly.


## Function commitPartialProfit

The `commitPartialProfit` function helps you automatically close a portion of your open trades when the price is moving in a profitable direction, essentially bringing you closer to your take profit target. It allows you to lock in some profits along the way. You specify the symbol of the trading pair and the percentage of the position you want to close, with the percentage ranging from 0 to 100. The function intelligently adapts to whether it’s running in a backtesting environment or a live trading scenario.


## Function commitPartialLossCost

This function lets you partially close a position when you're experiencing losses, specifically by specifying the dollar amount you want to reduce the position by. Think of it as a way to soften the blow of a loss while still aiming to protect your capital – it essentially moves your stop loss closer.

It handles some of the complex calculations for you, converting the dollar amount into the appropriate percentage of your existing position. 

The function assumes that the price is trending in the direction of your stop loss, and it automatically gets the current price to make these adjustments. It also adapts to whether it’s running in a backtest or a live trading environment.

You provide the trading symbol and the dollar amount you want to close, and it returns a boolean indicating whether the partial closure was successful.


## Function commitPartialLoss

The `commitPartialLoss` function allows you to automatically close a portion of an open trade when the price is heading towards your stop-loss level. It's designed to help manage risk by taking some profit while protecting against further losses. 

You specify the trading symbol and the percentage of the position you want to close, as a value between 0 and 100. The function handles whether it's running in a backtesting or live trading environment. It's a quick way to mitigate losses on a trade without fully exiting the position.


## Function commitCreateTakeProfit

This function lets you tell the backtest framework that a take-profit order for a position has been filled on the exchange. It's used to reconcile the strategy's VWAP-based take-profit calculations with the actual order execution, which might happen at a different price. Essentially, it acknowledges that the take-profit trigger was hit and a closing trade occurred.

The function checks if there’s a pending signal before proceeding, and it operates differently depending on whether the backtest is running in simulation or live mode. You provide the symbol of the trading pair, and optionally, you can include a payload with an ID and a note for tracking purposes.


## Function commitCreateStopLoss

This function lets you tell the backtest framework that a stop-loss order has been triggered and filled on the exchange. It's used when the actual order execution happens outside of the VWAP-based stop-loss check the framework performs. Think of it as confirming a stop-loss event that happened independently.

The framework will then record this event and note it as the reason for a deferred close on the next tick, effectively acknowledging that the position was closed due to the stop-loss.

If there isn’t a pending position, this function does nothing. The backtest framework automatically knows whether it's running a backtest or a live trading simulation.

You can optionally include extra information like an ID and a note with the function call for better record-keeping.

## Function commitCreateSignal

This function lets you feed custom signals directly into the backtest or live trading environment. It acts as a way to inject signals without using the standard signal retrieval method.

When you use it, the system checks if the signal is valid and prevents you from sending too many signals at once.

The signal's execution depends on whether you provide a `priceOpen` value: if you don't, it executes immediately at the current price.  If you *do* provide a `priceOpen`, it executes immediately if the price is already reached; otherwise, it waits until the price reaches that level.

The function automatically adapts to whether it's running a backtest or a live trading session.

You’ll need to supply the trading pair symbol and the signal details (the `dto`).


## Function commitClosePending

This function allows you to finalize and remove a pending trading signal without interrupting your strategy’s ongoing operation. It's useful when you want to acknowledge a pending order without fully executing it or want to clear a signal that’s no longer relevant. The function automatically adjusts its behavior based on whether you’re in a backtesting or live trading environment. You can optionally include details like an ID or note with the closure for record-keeping.

## Function commitCancelScheduled

This function lets you cancel a scheduled signal, essentially clearing it out without interrupting your trading strategy. Think of it as removing a planned action – it won’t affect any currently active signals or stop the overall strategy from running. It's designed to work seamlessly whether you’re in a backtesting environment or live trading. You can optionally add a note to the cancellation for record-keeping. The function intelligently figures out if it's running in a backtest or live environment, so you don't need to specify that.


## Function commitBreakeven

This function helps manage your trading risk by automatically adjusting your stop-loss order. It moves your stop-loss to the original entry price – essentially removing the risk – when the price has moved favorably enough to cover any fees and a small buffer. 

This buffer accounts for potential slippage, a common occurrence in trading. The function figures out whether it's running in a backtest or a live trading environment and retrieves the current price for calculations without you needing to handle those details. You just need to specify the trading pair symbol.

## Function commitAverageBuy

The `commitAverageBuy` function helps automate a dollar-cost averaging (DCA) strategy. It essentially adds a new purchase order to your existing trading plan, based on the current market price. This function is designed to keep track of all your purchases, calculating an average entry price for your position and notifying the system that a buy has occurred. It handles the details of determining the current price and adapts to whether you’re running a backtest or a live trade. You specify the trading pair (symbol) you're buying, and optionally can provide a cost.

## Function commitActivateScheduled

This function allows you to manually trigger a scheduled trading signal before the price reaches the intended entry point. It’s useful when you want to activate a signal ahead of time, perhaps based on external factors.

You'll provide the trading symbol and optionally a commit payload for record-keeping.

The function intelligently handles whether you're in backtesting or live trading mode.


## Function checkCandles

The `checkCandles` function verifies if the necessary historical candle data already exists and is available for your backtesting process. It efficiently checks this by communicating with the data persistence adapter.  Instead of loading all the data, it performs a quick check for each required timestamp. If even one candle is missing or doesn't align correctly, the function will report that the data isn't present, avoiding unnecessary downloads. This function utilizes the `ICheckCandlesParams` object to define the scope of the check.

## Function cacheCandles

The `cacheCandles` function makes sure your trading data is available for a specific period. It's designed to retrieve historical candle data, such as open, high, low, and close prices, and store it locally.

This process involves two steps: first, it checks if the data already exists, and if not, it fetches the missing data from an external source and verifies it again. This double-check ensures the reliability and accuracy of your trading data.

You provide details like the trading symbol, time interval (e.g., 1 minute, 1 hour), the start and end dates, and the name of the exchange to specify the data you need. Optional callbacks (`onCheckStart`, `onWarmStart`) allow you to track the progress of the data retrieval and validation.


## Function addWalkerSchema

This function lets you register a new "walker" – essentially, a custom tool for comparing the performance of different trading strategies. Think of it as setting up a system to run multiple strategies simultaneously on the same historical data and then see how they stack up against each other based on a chosen performance measure. You provide a configuration object, the "walkerSchema," which defines how this comparison will be conducted. This allows for flexible and customized backtesting and analysis beyond the framework’s built-in capabilities.


## Function addSweepSchema

The `addSweepSchema` function lets you define and register a sweep, which is essentially a way to systematically test different trading ideas. It runs each idea through a single simulated candle, using a connected exchange.

During this process, it learns about your preferred trading partners by building whitelists and blacklists, and it evaluates the performance of various entry and exit parameters.

You can specify the ranges to test for these parameters; if you don't provide them, sensible defaults are used. This is a powerful tool for optimizing your trading strategies.


## Function addStrategySchema

This function lets you register a new trading strategy within the backtest-kit framework. Think of it as telling the system about a specific way you want to generate trading signals. Once registered, the framework will automatically check that your strategy is working correctly, including verifying data like prices and stop-loss levels. It also helps prevent issues like overwhelming the system with too many signals and ensures your strategy’s data can be safely saved even if something unexpected happens during live trading. You provide a configuration object that describes how your strategy operates.

## Function addSizingSchema

This function lets you tell the backtest kit how to determine the size of your trades. Think of it as defining your risk management rules. You're essentially providing a blueprint that specifies how much capital to allocate to each trade based on factors like risk tolerance and market volatility. This configuration can include things like fixed percentages, Kelly Criterion calculations, or ATR-based sizing, along with constraints to keep positions within reasonable limits. By registering a sizing schema, you're ensuring that your backtest accurately simulates your trading strategy's position sizing logic.


## Function addRiskSchema

This function lets you set up the rules for how much risk your trading strategies can take on. 

Think of it as defining limits on how many trades you can have running at once and creating custom checks to make sure your portfolio is healthy. 

Importantly, all your strategies will share these risk settings, allowing them to influence each other and ensuring a coordinated approach to risk management. 

The system keeps track of all active trades, and you can use that information to build advanced checks and even control which trades are allowed or rejected.


## Function addMCPSchema

This function lets you connect your trading strategy to an external system that can monitor and potentially control it, often called an MCP (Model Context Protocol) agent. Think of it as building a bridge between your strategy and a dashboard or another application.

It essentially registers your strategy with the framework, allowing the MCP to receive updates about its status, like its holdings and positions.

You can also customize how the MCP displays information about your portfolio—otherwise, it will provide simple text messages for each traded symbol. This integration enables a real-time link between your trading strategy and external monitoring or control tools. The `mcpSchema` argument holds the configuration details for this connection.

## Function addFrameSchema

This function lets you tell backtest-kit about a new timeframe you want to use for your backtesting. Think of it as defining how your historical data will be organized – for example, you might want data in one-minute intervals, daily bars, or weekly charts. 

You provide a configuration object that specifies the start and end dates of your backtest, the time interval you're interested in, and a function that will generate the actual timeframes (the data points) based on those parameters.  Essentially, it’s how you tell the system how to slice up your historical data for analysis.


## Function addExchangeSchema

This function lets you tell the backtest-kit about a specific exchange you want to use for your backtesting. Think of it as registering the data source for a place like Coinbase or Binance. By adding an exchange schema, the framework knows where to get historical price data, how to format those prices, and can even calculate things like VWAP (a volume-weighted average price) based on recent trading activity. You provide the framework with details about your chosen exchange through an `exchangeSchema` object.


## Function addActionSchema

This function lets you plug in custom actions that are triggered during your backtesting or live trading. Think of actions as little helpers that react to specific events happening within your strategy – like when a trade reaches a profit target or hits a stop-loss.

You can use these actions to do things like update your trading journal, send notifications to a chat group, log events for analysis, or even trigger more complex actions based on the state of your trades.

The `actionSchema` you provide defines how this action behaves, specifying when it should run and what information it receives.  Each action runs independently for every combination of strategy and timeframe you’re using, giving you great flexibility to tailor your responses.

