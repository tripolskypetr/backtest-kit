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

The `writeMemory` function lets you store data related to a specific trading signal, essentially creating a persistent memory for that signal. 

It requires a bucket name, a unique memory ID, the data you want to store (which can be any object), and a descriptive label for what the data represents. 

The function automatically determines if it's running in a backtest or live environment based on the current execution context. Critically, it relies on an active, pending signal; if no signal is present, it won't write anything and will instead alert you to the missing signal. This allows you to attach data and observations to individual trading opportunities for later review or analysis.


## Function warmCandles

This function helps prepare your backtesting environment by downloading and storing historical candle data. Think of it as pre-loading the data your backtest will need. It grabs all the candles for a specific time interval, from a starting date (`from`) to an ending date (`to`), and saves them for quick access during your backtest runs. This avoids delays caused by repeatedly fetching data during the backtest itself, making the process much faster. You provide it with the necessary dates and interval to specify which candles to retrieve and store.

## Function validate

This function helps you make sure everything is set up correctly before you run any backtests or optimizations. It checks if all the entities you're using – like exchanges, strategies, and risk models – are properly registered in the system.

You can tell it to validate specific entity types, or if you leave it alone, it will check *everything*. 

This helps catch potential errors early and ensures your backtests run smoothly. The results of these checks are saved to improve speed.

## Function stopStrategy

This function lets you pause a trading strategy's signal generation. 

It essentially tells the strategy to stop creating new orders. Any existing open signals will finish up normally. Whether you're in backtest mode or live trading, the process will halt gracefully at a suitable point, usually when it’s idle or a signal has completed. You just need to specify the trading pair (like BTC-USDT) to indicate which strategy to stop.


## Function shutdown

This function helps you cleanly stop your trading simulations. It signals to all parts of the backtest that it’s time to wrap things up. Think of it as a polite way to exit, allowing everything to save its state or finish any ongoing tasks before the program closes. It’s especially useful when the simulation is interrupted.

## Function setLogger

You can now control how backtest-kit reports its activities. This function lets you plug in your own logging system.

Any messages the framework generates – things like trade executions or strategy decisions – will now go through your logger.

It automatically adds useful context to these messages, so you'll see things like the strategy name, exchange, and the symbol being traded, helping you understand exactly what's happening during your backtest. To do this, you just need to provide an object that follows the `ILogger` interface.

## Function setConfig

This function lets you adjust how the backtest-kit framework operates by changing its global settings. You can tweak things like the default data source or the maximum number of iterations allowed.  The `config` parameter lets you specify the settings you want to change; it doesn't require you to set every single setting, just the ones you need to modify. There’s also an `_unsafe` flag – use this only when you’re working in a testing environment and need to bypass some of the safety checks.

## Function setColumns

This function lets you customize the columns that appear in your backtest reports, like when you generate a markdown report. You can change the definitions of existing columns or add your own. The framework will check your configurations to make sure they are set up correctly, but if you're in a testing environment and need more flexibility, you can bypass those checks using the `_unsafe` parameter. This is a great way to tailor your reports to show exactly the data you need.

## Function searchMemory

The `searchMemory` function helps you find relevant pieces of memory data based on a search query. It's designed to efficiently sift through stored information.

It figures out which symbol and signal you're working with by looking at the current system context. If there isn't a pending signal, it will let you know with a warning.

The function uses a sophisticated search method (BM25) to rank the memory entries based on how well they match your query, providing a score for each match. 

It automatically adapts to whether you're running a backtest or a live trading session.

The function returns a list of found memory entries, along with their unique IDs, scores, and the content itself. You can customize the type of content being retrieved by specifying a generic type `T`.


## Function runInMockContext

The `runInMockContext` function lets you execute code as if it were running within a trading framework environment, but without needing a full backtest setup. This is particularly helpful for testing or developing scripts that rely on things like the current timeframe or other context-dependent data.

You can customize the "mock" environment to mimic a live trading situation, or even a backtest setup, by providing values for things like exchange name, strategy name, and the symbol being traded. If you don’t provide these values, it will create a basic, live-mode environment with placeholder names. This function returns a promise that resolves with the result of the function you ran.

## Function removeMemory

This function lets you delete a specific memory entry associated with a signal. 

It finds the symbol and signal ID automatically from the current testing environment and the signal currently being processed.

If there isn't a signal being processed, it will just log a message and not do anything.

The function handles whether you're in a backtesting or live trading mode without you needing to specify it. 

You provide the function with the bucket name and the unique ID of the memory entry you want to remove.


## Function readMemory

The `readMemory` function lets you retrieve data stored in a specific memory location tied to the current trading signal. Think of it as accessing a pre-saved piece of information that's relevant to what's happening now.

It needs a couple of pieces of information to find the data: the name of the bucket where it’s stored and a unique ID identifying the memory itself.

The function also figures out whether you're in a backtesting simulation or live trading, so you don’t have to worry about that.

If there's no active signal to associate the memory with, it'll alert you with a warning and won't be able to return any data.


## Function overrideWalkerSchema

This function lets you tweak an existing walker configuration, which is useful when you want to compare different strategies using the same underlying data processing setup. Think of it as a way to make targeted changes to how your data is prepared for backtesting – you're only updating the parts you need to change, while keeping the rest of the original configuration intact. You pass in a partial configuration, and it returns a new, updated walker configuration.

## Function overrideStrategySchema

This function lets you modify a strategy that's already been set up within the backtest-kit framework. Think of it as making small tweaks instead of creating a whole new strategy from scratch. You provide a piece of the strategy's configuration – just the parts you want to change – and the function applies those changes to the existing, registered strategy. The rest of the strategy’s settings stay exactly as they were before. This is useful for things like adjusting parameters or adding small features without disrupting the entire strategy's setup.


## Function overrideSizingSchema

This function lets you adjust an existing position sizing plan without completely replacing it. Think of it as fine-tuning – you can change specific settings, like the initial position size or the multiplier, while keeping the rest of the sizing configuration as it is. It's useful when you need to make small adjustments to your sizing strategy without redoing everything from scratch. You provide a partial sizing configuration, and this function merges it with the existing one.

## Function overrideRiskSchema

This function lets you tweak an existing risk management setup within the backtest-kit framework. Think of it as making small adjustments – you provide a set of changes, and only those specific settings are updated. The rest of the original risk configuration remains untouched. It's useful for fine-tuning your risk controls without having to redefine everything from scratch. You provide a partial configuration object, and it returns a modified risk schema.

## Function overrideFrameSchema

This function lets you modify an existing timeframe configuration used in your backtesting. Think of it as tweaking a pre-existing setting instead of creating a brand new one from scratch.  You provide a partial configuration – just the parts you want to change – and the function updates the original timeframe schema. Everything else stays the same. This is useful if you need to adjust parameters without redefining the entire timeframe setup.

## Function overrideExchangeSchema

This function lets you modify an existing exchange's data source within the backtest-kit framework. Think of it as a way to tweak a previously set-up exchange—you're not creating a new one, just changing specific details. Only the information you provide will be updated; everything else about the exchange remains as it was before. This is handy for making adjustments to an exchange's configuration without having to redefine the whole thing. You give it a partial exchange configuration object and it returns the updated exchange schema.

## Function overrideActionSchema

This function lets you tweak existing action handlers within the backtest-kit framework without completely replacing them. Think of it as making targeted adjustments – only the parts you specify in the new configuration will be updated, leaving everything else untouched. This is really handy for things like updating how events are handled, adjusting callbacks for different environments like development versus production, or even swapping out the actual implementation of a handler on the fly. It's a flexible way to modify behavior without needing to rewrite the whole strategy. You'll pass in a partial configuration object, defining just the changes you want to make.

## Function listenWalkerProgress

This function lets you track the progress of your backtesting simulations. It provides updates after each strategy finishes running within the simulation process. You give it a function that will be called with information about the progress. Importantly, these updates happen one at a time, even if your provided function needs to do some work asynchronously, so you won’t have conflicts when processing. The function returns another function which you can call to unsubscribe from these progress updates.


## Function listenWalkerOnce

This function lets you set up a listener that reacts to events from a walker, but only once. You provide a condition – a filter – that determines which events you're interested in. Once an event matches that filter, the provided callback function runs and then the listener automatically stops, preventing it from firing again. It's really handy when you need to react to a specific condition occurring within a larger process. 

You'll give it two things: a function that checks each event to see if it’s the one you want, and then a function that gets called when you find that event. After the function is called, the listener is automatically removed.

## Function listenWalkerComplete

This function lets you listen for when a backtest run finishes, ensuring that all the strategies have been tested. When you subscribe, it guarantees that the completion events are handled one after another, even if the processing of each event involves asynchronous operations. This helps avoid potential conflicts and ensures a reliable flow of information after the testing is complete. You provide a function that will be called with details about the completion event, and the function returns another function to unsubscribe.

## Function listenWalker

The `listenWalker` function lets you track the progress of a backtest as it runs. It's like setting up a listener that gets notified when each trading strategy finishes within the backtest.

This listener uses a special queuing system, so the updates you receive are handled one at a time, even if your callback function takes some time to process the information. 

You provide a function (`fn`) that will be called whenever a strategy completes, and that function receives an event object describing the progress. The function returned by `listenWalker` can be called to unsubscribe from these progress updates.


## Function listenValidation

This function lets you keep an eye on potential problems during the risk validation process. It essentially listens for errors that pop up when the system is checking signals, which is great for spotting and fixing issues. 

Whenever an error occurs during this validation, your provided function will be triggered. This happens in a controlled, sequential manner, even if your function takes some time to run, helping you to avoid unexpected behavior. Think of it as a safety net to catch and handle any hiccups in your validation checks. You provide a function that gets called when an error occurs, and the function itself returns a way to stop listening.

## Function listenSyncOnce

This function lets you listen for specific synchronization events, but it only runs your code once when it finds a match. Think of it as a one-time listener. 

It's handy when you need to coordinate with external systems because it pauses the trading process until your code finishes running, ensuring everything is in sync.

You define a filter (`filterFn`) to determine which events you’re interested in. When a matching event occurs, your callback function (`fn`) is executed just once. If your callback returns a promise, the trading system will wait for that promise to resolve before continuing, which is important for ensuring proper synchronization.

## Function listenSync

This function lets you react to synchronization events within the backtest kit. It's designed to keep things in sync, especially when interacting with external systems. 

Think of it as a way to be notified when a signal is being processed – like when an order is about to be placed or closed. If the function you provide takes some time to finish (like a promise), the system will pause any further actions until it's done, guaranteeing everything stays coordinated. It's particularly helpful if you need to confirm something externally before proceeding.


## Function listenStrategyCommitOnce

This function allows you to temporarily "watch" for specific strategy events within your backtest. 

It lets you specify a condition – a filter – that an event must meet before your code runs. 

Once an event matches that filter, your provided function will execute just once and then the listener automatically stops, preventing further unnecessary executions. This is perfect for situations where you need to react to a particular strategy action and then move on. You give it a rule to look for, and a function to run when the rule is met, and it handles the subscription and unsubscription for you.


## Function listenStrategyCommit

This function lets you tap into what's happening with your trading strategies. It's like setting up an observer to be notified whenever certain actions are performed, such as cancelling a scheduled trade, closing a position, or adjusting stop-loss and take-profit levels. These events are handled one at a time, ensuring that your reaction to them doesn't cause any unexpected issues. You provide a function that will be called each time one of these events occurs, and this function receives details about the event. You can then unsubscribe from these events when you no longer need to listen.

## Function listenSignalOnce

This function lets you react to a specific signal event just once and then automatically stops listening. Think of it as setting up a temporary observer that only cares about one particular type of event. You define what kind of event you're looking for using a filter function, and then specify what should happen when that event occurs. Once that event happens, the listener is removed, preventing further callbacks. This is really helpful if you need to perform an action based on a single, specific signal during a backtest.


## Function listenSignalNotifyOnce

This function lets you temporarily listen for specific trading signals. You provide a filter that defines which signals you're interested in, and a callback function that gets executed *just once* when a matching signal arrives. After that single execution, the listener automatically stops, so you don’t have to worry about cleaning up subscriptions. It's a convenient way to react to a signal and then forget about it.

You give it two things: a way to identify the signals you want (the filter) and the code to run when one of those signals appears. 


## Function listenSignalNotify

This function lets you tap into notifications whenever a trading strategy shares a custom note related to an open position. Think of it as a way to be informed about specific events happening within your strategy's execution. It ensures these notifications are handled one at a time, even if the information needs some processing, preventing any potential conflicts. You provide a function that will be called whenever a strategy uses `commitSignalInfo()` to send that note. When you’re done listening, the function returns a way to unsubscribe.

## Function listenSignalLiveOnce

This function lets you temporarily listen for specific trading signals coming from a live simulation. It’s designed to react to signals just once and then stop listening.

You provide a filter—essentially a rule—to determine which signals you're interested in. Then, you give it a function that will be executed only when a signal matches your filter. After that single execution, the subscription is automatically canceled, so you don't have to worry about cleaning up. It only works with signals generated during a live simulation run.


## Function listenSignalLive

This function lets you tap into the live trading signal stream from backtest-kit. You provide a function that will be called whenever a signal event occurs during a live trading simulation. 

Importantly, it only works with signals generated by `Live.run()`.

The events you receive are handled one after another, ensuring you get them in the order they happened. The function returns another function which is used to unsubscribe from the signal events.

## Function listenSignalBacktestOnce

This function lets you temporarily "listen in" on the signals generated during a backtest run, but it's designed to only receive and process one specific signal. You provide a filter that defines which signals you’re interested in, and a function that will be executed once when a matching signal arrives. After that single execution, the function automatically stops listening, so you don't have to worry about cleaning up your subscription. It's perfect for a quick, one-time check of the backtest's data flow.

The filter function allows you to specify criteria for the signals you want to observe.
The callback function handles the relevant event once it's been filtered.


## Function listenSignalBacktest

The `listenSignalBacktest` function lets you tap into the stream of data generated during a backtest. It's a way to receive updates as the backtest progresses, allowing you to monitor and potentially react to the simulated trading activity.

You provide a function that will be called whenever a new signal event happens during the backtest run initiated by `Backtest.run()`.

Events are delivered in the order they occurred, ensuring you see them sequentially. 

This subscription is designed to handle the events asynchronously, meaning it won't block the main backtest process.

The function returns another function that you can call to unsubscribe from these updates, cleaning up your listeners when you no longer need them.


## Function listenSignal

This function lets you receive updates whenever a trading strategy changes state, like when it's idle, opens a position, is actively trading, or closes a position. It handles these updates one at a time, even if your code takes some time to process each update – preventing things from getting out of order. You provide a function that will be called with each of these signal events, and the function returns another function that you can use to unsubscribe from the signal updates later.

## Function listenSchedulePingOnce

This function lets you set up a listener that reacts to specific "ping" events based on a condition you define. Think of it as waiting for something particular to happen. Once that specific event occurs, the function executes your provided code (the callback) just once, and then it automatically stops listening. This is really handy when you need to react to a one-time event and don't want to keep monitoring afterward.

You provide a filter – a rule that determines which events are interesting to you.  The callback is the action you want to perform when an event passes that filter. The function returns a function you can call to stop listening if needed, but otherwise, it handles the subscription and unsubscription for you.

## Function listenSchedulePing

The `listenSchedulePing` function lets you keep an eye on scheduled signals as they wait to become active. It sends out a "ping" event every minute while a signal is in this waiting period. You provide a function that will be called whenever a ping arrives, allowing you to track the signal's status or run custom checks. This provides a way to monitor the signal lifecycle and handle events asynchronously. Essentially, it's a way to get notified periodically while a signal is being prepared.


## Function listenRiskOnce

The `listenRiskOnce` function lets you react to specific risk rejection events just once and then stop listening. It's like setting up a temporary listener – you provide a filter to identify the events you care about, and a function to run when a matching event occurs. After the function runs once, the listener automatically goes away, preventing it from triggering again. This is perfect for situations where you need to react to a particular risk condition only one time.

You tell it what kind of risk events to look for with `filterFn`.
Then, you tell it what to do when it finds one with `fn`.
Once that function runs, `listenRiskOnce` takes care of stopping itself.


## Function listenRisk

The `listenRisk` function lets you monitor for situations where your trading signals are being blocked due to risk checks.

Think of it as a way to be notified only when something goes wrong with your risk management—it won't bother you with signals that are perfectly okay.

It guarantees that these risk events are processed one at a time, ensuring a smooth and predictable handling of those situations, even if your response involves asynchronous operations.

To use it, you provide a function that will be called whenever a signal is rejected because of a risk issue. The function you provide will receive information about that specific risk event. When you're done, the function returns another function you can call to unsubscribe.

## Function listenPerformance

This function lets you keep an eye on how long different parts of your trading strategy take to run. It listens for events that report performance metrics, like the time taken for specific operations.

Think of it as a tool to help you pinpoint where your strategy might be slow or inefficient. 

These events are handled one at a time to avoid any confusion and ensure accurate timing, even if the function you provide to handle the event takes some time to complete.  You give it a function that will be called whenever a performance event occurs. This lets you collect and analyze the data to optimize your strategy.

## Function listenPartialProfitAvailableOnce

This function lets you set up a one-time alert for when a specific partial profit condition is met during your backtesting. You provide a filter that defines the exact conditions you're looking for, and a callback function that will run just once when those conditions are met. After that one execution, the alert automatically stops listening, so you don't have to worry about cleanup. It's perfect for scenarios where you need to react to a particular profit milestone just once. 

Here’s how it works:

*   You give it a function (`filterFn`) that checks if an event matches what you're looking for.
*   You also provide a function (`fn`) that will be called with the event data when a match is found.
*   The function returns another function which, when called, unsubscribes you from the event stream.


## Function listenPartialProfitAvailable

This function lets you get notified whenever your backtest reaches certain profit milestones, like 10%, 20%, or 30% gains. It's designed to handle these events one at a time, even if your notification code takes some time to run. Think of it as a way to react to your trading strategy’s progress without worrying about things getting jumbled up. You provide a function that gets called with information about the achieved profit level. Importantly, the callback will be executed sequentially, preventing potential issues from overlapping executions.


## Function listenPartialLossAvailableOnce

This function lets you set up a listener that reacts to a specific kind of change in your trading system – a partial loss event. It's designed to be a one-time deal: you tell it what you're looking for, it triggers a function when that condition is met, and then it stops listening. Think of it as waiting for a particular signal to appear and then taking action once.

You provide a filter – a way to specify exactly what kind of partial loss event you're interested in. Then, you give it a function that should run when that specific event happens. The listener will only execute your function once before automatically unsubscribing. This is great for things like triggering a specific action when a certain loss level is reached.


## Function listenPartialLossAvailable

This function lets you be notified whenever your trading strategy experiences a certain amount of loss during a backtest. 

You provide a function that will be called whenever the loss reaches milestones like 10%, 20%, or 30% of the initial capital. 

Importantly, these notifications are handled in a specific order and one at a time, even if your provided function takes some time to complete. This ensures that the events are processed reliably and prevents any potential issues from overlapping executions. To stop listening, the function returns another function that can be called to unsubscribe.


## Function listenMaxDrawdownOnce

This function helps you react to specific drawdown situations in your trading backtests, but only once. It allows you to set up a "watcher" that only triggers a function once when a particular drawdown event occurs – for example, if the drawdown exceeds a certain threshold. 

It takes two parts: first, you define a filter to specify the drawdown conditions you’re interested in. Then, you provide a function that will run only the first time the filter's condition is met. After that, the subscription is automatically turned off, so you don't continue receiving notifications. It’s great for tasks like immediately pausing a backtest or adjusting parameters when a drawdown hits a critical point.


## Function listenMaxDrawdown

This function lets you keep an eye on when your backtest strategy hits new drawdown lows. Think of it as a notification system – whenever your strategy's drawdown reaches a new minimum, this function will let you know.

It handles these notifications in a specific order, ensuring that even if your notification process takes some time, you won't miss anything. 

This is particularly useful if you want to automatically adjust your risk levels or log significant drawdown events as your strategy runs.

To use it, you simply provide a function that will be called whenever a new maximum drawdown is detected. This function will receive details about the drawdown event. And when you are done, the initial function call returns a function which you can call to unsubscribe.

## Function listenIdlePingOnce

This function lets you react to events indicating periods of inactivity in your application. You provide a way to select which of these inactivity events you’re interested in, and a function to run when a matching event happens. Importantly, the function you provide will only be executed once for each filter you set up - it automatically unsubscribes after that single execution. It returns a function that you can call to stop listening to these events.

## Function listenIdlePing

This function lets you listen for moments when your trading system is completely idle – meaning no signals are actively being watched or processed. 

It calls your provided function whenever this idle state occurs.

Think of it as a notification system that tells you when everything is quiet, allowing you to potentially perform maintenance tasks or other background operations.

The function returns an unsubscribe function, so you can stop listening for these idle ping events later.

## Function listenHighestProfitOnce

This function lets you watch for specific instances of highest profit events and react to them just once. You provide a filter that defines what kind of profit event you're interested in, and a function that will run when that event occurs. After the callback runs once, the listener automatically stops, so you don't have to worry about cleaning up.

It’s handy when you need to respond to a particular profit condition and then move on.

**Parameters:**

*   `filterFn`:  A way to specify the exact type of highest profit event you want to watch for.
*   `fn`: The action you want to take when an event matching the filter appears.

## Function listenHighestProfit

This function lets you keep an eye on when your trading strategy hits a new peak profit level. It's like setting up a notification system that alerts you whenever a new highest profit is achieved. 

The alerts are handled one at a time, even if the notification process itself takes some time, ensuring that events are processed in the order they occur. 

You can use this to track significant profit milestones or build systems that automatically adjust based on profit performance. To use it, you provide a function that will be called whenever a new highest profit is recorded.

## Function listenExit

This function lets you react to truly serious errors that will halt the backtest or live trading process. Think of it as an emergency alert system for your trading framework. 

It's designed to catch errors that are so significant, they force the system to stop completely, like problems with background processes. 

When a critical error occurs, the function you provide will be called, and importantly, these error events are handled one after another to avoid confusion or unexpected behavior. The framework will ensure your error handling runs smoothly, even if it takes some time.


## Function listenError

The `listenError` function lets you set up a way to catch and deal with unexpected errors that happen while your trading strategy is running. Think of it as a safety net for issues like failed API connections. Instead of stopping everything, these errors are handled, and your strategy keeps going. The errors are handled one at a time, in the order they happen, and even if your error handling code takes some time, it won’t interfere with the sequence. This is like having a system to smoothly manage problems as they arise.

It takes a function as input—this function will be called whenever a recoverable error occurs. The function receives an `Error` object containing details about the problem. The function returns a function that can unsubscribe from these errors.

## Function listenDoneWalkerOnce

This function allows you to listen for when a background task finishes, but only once. 

You provide a filter that determines which completion events you're interested in, and a function that gets executed when a matching event occurs. 

After the callback runs the first time, it automatically stops listening, so you don't need to worry about manually unsubscribing. It's great for quick, one-off actions when a background process completes.


## Function listenDoneWalker

This function lets you listen for when a background process within your backtest finishes. 

Think of it as setting up a notification system for asynchronous tasks.

You provide a function (`fn`) that will be called whenever a background task is done.  

Importantly, these completion notifications happen one at a time, ensuring that even if your notification function does some work, the order is preserved and things don't get jumbled. This ensures that everything is processed correctly, sequentially.


## Function listenDoneLiveOnce

This function lets you react to when background tasks finish running within your backtest. It's useful for monitoring progress or performing actions once a specific background process completes.

You provide a filter – essentially, a rule – to determine which completion events you're interested in. Then, you give it a function to run when a matching event occurs. 

The important thing is this: the function will only run *once* and then automatically stops listening, so you don't have to worry about managing the subscription yourself. It's a clean and simple way to respond to background task completions.


## Function listenDoneLive

This function lets you keep track of when background tasks initiated by `Live.background()` are finished. It's like setting up a listener that gets notified when these tasks are done.

Crucially, these notifications are handled one after another, even if the function you provide to process them takes time to complete. This ensures things happen in the order they’re received and prevents multiple processes from running at the same time.

You give it a function (`fn`) that will be called whenever a background task finishes, and it returns another function that you can use to unsubscribe from these notifications later.

## Function listenDoneBacktestOnce

This function lets you react to when a background backtest finishes, but it only triggers once and then stops listening. You provide a filter function to specify which backtest completions you're interested in. Once a matching backtest completes, a callback function you provide will be executed with information about that backtest. After that single execution, the listener is automatically removed, preventing further notifications.

## Function listenDoneBacktest

This function lets you be notified when a background backtest finishes running. 

You provide a function that will be called once the backtest is complete.

It ensures that these completion notifications are handled one at a time, even if your notification function involves asynchronous operations, preventing potential conflicts. This way you can safely react to the backtest results.


## Function listenBreakevenAvailableOnce

This function lets you react to a specific breakeven protection event – but only once. You provide a filter to specify exactly which events you're interested in, and a function to run when that event happens. Once the event matches your filter, the provided function executes, and then the subscription automatically stops, making it perfect for situations where you need to respond to something just once. It essentially provides a way to wait for a particular breakeven condition and then take action immediately. 


## Function listenBreakevenAvailable

This function lets you be notified whenever a trade's stop-loss is automatically adjusted to the original entry price. It's a safety feature – when a trade becomes significantly profitable, the stop-loss moves to breakeven to protect profits and cover potential transaction fees. 

You provide a function that will be called whenever this happens, and it ensures that these notifications are handled one at a time, even if your function takes some time to complete. Essentially, you’re setting up an observer that listens for this specific event and executes your provided logic when it occurs. This helps in managing and reacting to protective breakeven adjustments within your trading strategy.


## Function listenBacktestProgress

This function lets you keep an eye on how your backtest is running. It sets up a listener that gets notified as the backtest progresses, sending updates one at a time. These updates are delivered in the order they happen, even if the function you provide takes some time to process each one. It ensures that the updates are handled safely, preventing any issues caused by running multiple callbacks at the same time. You provide a function that will be called with each progress update.

## Function listenActivePingOnce

This function lets you set up a temporary listener that reacts to specific "active ping" events. You tell it what kind of event you're looking for using a filter, and then provide a function to run *only once* when that event appears. After that one execution, the listener automatically stops listening. It's great when you need to wait for a certain condition to be met by an active ping and then perform a single action. 

Essentially, it simplifies the process of listening, reacting, and then stopping, all in one go. 

The `filterFn` is how you define the condition you're waiting for. The `fn` is the code that will run once the condition is met.


## Function listenActivePing

This function lets you keep an eye on active trading signals. It listens for events – think of them as updates – that happen every minute, telling you about the status of your signals.

You can use this to build systems that react to changes in your signals, like automatically adjusting your trading strategies.

The function delivers these updates one at a time, even if the process of handling them takes some time. It makes sure things happen in order and prevents any conflicts.

To use it, you provide a function that will be called whenever a new active ping event is detected. This function will receive the details of the ping event. When you're done, you can unsubscribe from these updates using the function that the `listenActivePing` function returns.

## Function listWalkerSchema

This function lets you see all the different ways your backtest kit can analyze data. It gives you a list of "walkers," which are essentially pre-built tools for examining your trading data and highlighting specific patterns. Think of it as a way to peek under the hood and see exactly what analysis methods are available to you. You can use this to check if everything is set up correctly, create documentation, or even build user interfaces that let you choose which analyses to run.


## Function listStrategySchema

This function gives you a way to see all the different trading strategies you've set up within your backtest-kit environment. It essentially provides a directory of available strategies, allowing you to inspect their configurations and understand what options you have for running simulations. You can use this list to check your work, generate documentation, or even build a user interface that dynamically displays available strategies. Think of it as a quick inventory of your trading strategies.


## Function listSizingSchema

This function lets you see all the sizing strategies that are currently set up within your backtest kit environment. Think of it as a way to peek under the hood and understand how your backtest will determine position sizes. It returns a list of these sizing configurations, which can be helpful when you're trying to figure out what’s going on, building tools to manage these strategies, or simply documenting your setup. It's a quick and easy way to see exactly what sizing rules are in place.

## Function listRiskSchema

This function lets you see a complete overview of all the risk configurations that are currently active in your backtest. Think of it as a way to check what rules and constraints are being applied during your simulations. It returns a list, allowing you to inspect each risk configuration individually, which is handy for troubleshooting or creating interfaces to manage your risk settings. You can use this to confirm that all your intended risk controls are in place.


## Function listMemory

This function lets you see all the stored memories associated with a specific signal. 

It automatically figures out whether you're running a backtest or live trading and gets the symbol from the current environment. 

If there isn't a signal currently being processed, you'll see a warning, and the function will return an empty list of memories. You provide the bucket name to specify where the memories are stored. The returned list will contain the memory ID and the content of each memory.

## Function listFrameSchema

This function helps you discover all the different data structures, or "frames," that your backtesting environment is using. Think of it as a way to peek behind the curtain and see exactly what kind of data your trading strategies are working with. It returns a list of these frames, allowing you to inspect their contents and ensure everything is set up correctly. You can use this to build tools that automatically generate documentation or create user interfaces that adapt to the available data.

## Function listExchangeSchema

This function gives you a look at all the exchanges your backtest-kit is currently set up to work with. It's like a directory of available exchanges, providing a list of their configurations. You can use this to check what's registered, generate documentation, or even build interactive tools that adapt based on the supported exchanges. Essentially, it allows you to see the complete picture of exchanges available for backtesting.


## Function hasTradeContext

The `hasTradeContext` function lets you quickly see if your trading environment is fully set up for making trades. It confirms that both the execution and method contexts are working. Think of it as a check to make sure everything is ready before you try to use important functions like getting historical price data or formatting trade details. If it returns true, you're good to go!

## Function hasNoScheduledSignal

This function helps you check if there's currently no signal scheduled for a specific trading pair, like "BTCUSDT". 

It returns `true` if no scheduled signal exists and `false` if one does. 

Think of it as the opposite of a function that checks for a scheduled signal – you can use this to make sure your signal-generating processes only run when needed. 

It cleverly figures out whether you're running a backtest or a live trading environment without you needing to specify.

You provide the trading pair symbol as input, and it handles the rest.


## Function hasNoPendingSignal

This function, `hasNoPendingSignal`, lets you quickly check if there's currently a signal waiting to be triggered for a specific trading pair, like 'BTCUSDT'. It returns `true` if no signal is pending, and `false` if one exists. Think of it as the opposite of `hasPendingSignal` - you can use it to make sure your system doesn't try to generate new signals when one is already in progress. Importantly, it automatically figures out whether the code is running in a backtesting environment or a live trading setup. You simply provide the symbol of the trading pair you're interested in, and it will give you a clear answer.


## Function getWalkerSchema

The `getWalkerSchema` function helps you access information about how a specific trading strategy, which we call a "walker," is designed and operates. Think of it as looking up the blueprint for a particular trading approach. You provide the name of the walker you're interested in, and the function returns a detailed description of its structure and how it works. This lets you understand what data the walker needs, what calculations it performs, and what decisions it makes. It's useful for examining and understanding the inner workings of different trading strategies.

## Function getTotalPercentClosed

This function lets you check how much of your position in a specific trading pair is still open. It gives you a percentage – 100 means you haven't closed any part of the position, while 0 means it's completely closed. 

Importantly, it considers any Dollar-Cost Averaging (DCA) entries you've made when calculating this percentage, giving you an accurate picture even if you've closed the position in smaller chunks.

The function figures out whether it's running in a backtesting environment or a live trading environment on its own, so you don't have to worry about setting that.

You just need to tell it which trading pair's position you’re interested in.

## Function getTotalCostClosed

This function helps you figure out how much money you've invested in a particular asset, like BTC or ETH. It calculates the total cost basis, essentially the average price you paid for it, taking into account any times you've added to your holdings (Dollar-Cost Averaging or DCA).

Importantly, it understands whether you're running a test backtest or a live trade and adjusts accordingly.

To use it, just provide the trading pair's symbol as input, such as "BTCUSDT". The function will then return the total cost basis in dollars.

## Function getTimestamp

This function retrieves the current timestamp being used in your trading simulation or live environment. When you're backtesting, it gives you the timestamp associated with the specific historical timeframe you’re analyzing. If you're running in a live trading context, it provides the actual, current timestamp. Essentially, it tells you "what time is it" for your trading decisions.

## Function getSymbol

This function allows you to find out what symbol your backtest or trading strategy is currently focused on. It's a simple way to retrieve the symbol being traded, returning it as a promise that resolves to a string. Think of it as a quick way to check which asset you’re working with.

## Function getStrategySchema

The `getStrategySchema` function lets you fetch the blueprint for a specific trading strategy you've registered within your backtest-kit setup. Think of it as looking up the official definition of how that strategy works. You provide the unique name you gave the strategy, and it returns a detailed description outlining its components and how it's structured. This is helpful for understanding, validating, or programmatically interacting with your strategies.

## Function getSizingSchema

This function lets you fetch details about a specific sizing strategy that's been set up within your backtesting environment. Think of sizing as determining how much of your capital to allocate to each trade.

You provide a name, which acts like a label for the sizing strategy, and the function returns a complete description of that sizing strategy. This description includes things like the formulas and parameters used to calculate trade sizes. It's a straightforward way to understand and verify the sizing rules being applied to your backtest.

## Function getScheduledSignal

This function lets you retrieve the signal that’s currently being used based on a pre-defined schedule. It's handy for strategies that operate on a timed basis. 

Think of it as checking what the strategy should be doing right now according to the schedule. 

If there isn’t a signal scheduled at this time, it will tell you, returning a null value. It intelligently figures out whether you’re running a backtest or a live trading session, so you don't need to specify that. 

You just need to provide the trading pair, like 'BTCUSDT', to get the relevant signal.

## Function getRiskSchema

This function helps you find the specific details of a risk you've defined within your backtesting setup. It's like looking up a blueprint – you give it the name of the risk (like "VolatilityRisk" or "PositionSizeRisk"), and it returns a structured description of what that risk entails, including how it's measured and controlled. This schema defines the rules and parameters for managing that particular type of risk. The `riskName` is the unique identifier used to pinpoint the exact risk schema you're searching for.

## Function getRawCandles

The `getRawCandles` function allows you to retrieve historical candlestick data for a specific trading pair and timeframe. You can control how many candles you want and define a start and end date for the data retrieval. 

It offers flexibility with date and limit parameters, making it easy to narrow down the data you need. 

The function automatically handles date calculations when you only provide some of the parameters, and it always ensures that the requested data adheres to the trading execution context, preventing any issues with looking into the future. 

Here's a quick rundown of how the parameters work together:
*   You can specify a start date, end date, and the number of candles.
*   Or just define a start date and end date.
*   Or provide an end date and number of candles.
*   Or, if you only want a certain number of candles, the function will pull data from a point in the past defined by the execution context.

The parameters include the trading symbol (like "BTCUSDT"), the candle interval (like "1m" for one-minute candles), an optional limit for the number of candles, and optional start and end dates as timestamps in milliseconds.

## Function getPositionWaitingMinutes

This function tells you how long a trading signal has been patiently waiting to be put into action. It checks a specific trading pair, like BTC/USD, and reports the time in minutes that the signal has been on hold.

If there isn’t a signal currently waiting, the function will let you know by returning null. 

You provide the trading symbol to the function to specify which signal you’re interested in.

## Function getPositionPnlPercent

This function helps you understand how much profit or loss you’re currently holding on a trade, expressed as a percentage. It looks at your open positions and calculates the unrealized profit or loss, considering factors like partial closes, dollar-cost averaging, potential slippage, and fees. 

If there aren't any active trades, it will return null. 

The function simplifies things by figuring out whether you're in a backtest or a live trading environment and also fetches the current market price for you, making it easy to check your position’s performance. You just need to provide the symbol of the trading pair.


## Function getPositionPnlCost

This function lets you check the unrealized profit or loss in dollars for an open trade. It figures out how much you'd gain or lose if you closed the position right now, based on the difference between the current market price and your entry price.

The calculation takes into account several factors, like how much you initially invested, any partial trades you’ve made, and even slippage and fees.

If there’s no open trade, the function will return null. It intelligently figures out whether it's running in a backtesting or live trading environment and automatically gets the current price for the trade. 

You just need to provide the trading symbol, such as "BTC-USDT".

## Function getPositionPartials

getPositionPartials lets you see how your trading position has been incrementally closed out, either for profit or to limit losses. It shows a history of the partial closes you've triggered using functions like commitPartialProfit. If you haven't triggered any partial closes yet, it returns an empty list. The information returned for each partial close includes the type (profit or loss), the percentage of the position closed, the price at which it was closed, the cost basis at that time, and how many DCA entries were factored in. You provide the symbol of the trading pair you're interested in to retrieve this data. If no signal exists, the function will return null.

## Function getPositionPartialOverlap

This function helps prevent accidentally closing out a position multiple times at nearly the same price. It checks if the current market price is close enough to a previously established partial close price.

Essentially, it determines if a new partial close order would overlap with a previous one, avoiding redundant trades.

You provide the trading symbol and the current price, and optionally configure the tolerance level—how close the price needs to be to trigger the overlap.

The function returns true if the current price falls within the acceptable range of a previous partial close, otherwise, it returns false. This is useful for managing your order execution strategy.

## Function getPositionMaxDrawdownTimestamp

This function helps you pinpoint exactly when a specific trading position experienced its biggest loss. It retrieves the timestamp marking the moment that maximum drawdown occurred for the given symbol. If there are no open positions for that symbol, it won't return a value. You can use this information to analyze position performance and understand drawdown patterns.


## Function getPositionMaxDrawdownPrice

This function helps you understand the biggest drop in price a specific trade has experienced. It tells you the lowest price point the trade hit while it was open, essentially showing you how far it fell from its highest point. 

Think of it as a way to see the maximum drawdown for a particular trade. 

If there's no active trade associated with the symbol you request, this function will return null.

You provide the symbol, like "BTCUSDT", to identify the trade you're interested in.


## Function getPositionMaxDrawdownPnlPercentage

This function helps you understand the risk profile of a specific trading position. It calculates and returns the percentage of profit or loss that occurred at the point when the position experienced its biggest drawdown. Essentially, it shows you how far in the red a position went at its worst moment. If there isn't an active trading signal for the symbol, the function will return null. You provide the trading pair symbol, like "BTC-USDT," to specify which position's drawdown performance you want to examine.


## Function getPositionMaxDrawdownPnlCost

This function helps you understand the financial impact of a trade. 

It calculates the total cost (in the currency of the trade, like USD or EUR) you've incurred up to the point where your position experienced its biggest loss. 

Essentially, it shows how much you've lost relative to the lowest point your trade has reached.

You provide the trading pair's symbol (like "BTC-USD") to get this information for that specific trade. 

If there's no active trade signal, the function won't have any data to analyze and will return null.


## Function getPositionMaxDrawdownMinutes

getPositionMaxDrawdownMinutes tells you how much time has passed since your position experienced its biggest loss. It's essentially a measure of how long ago the market hit its lowest point for that trade. If the price has just reached its lowest point, this value will be zero. If there's no active trade happening, the function will return null. You specify which trading pair (like BTC-USD) you’re interested in when calling the function.

## Function getPositionLevels

getPositionLevels helps you understand the prices at which your strategy has entered into a position using dollar-cost averaging (DCA). 

It gives you a list of prices, starting with the original entry price when the signal was first triggered. 

If you've used commitAverageBuy to add more entries at different prices, those will be listed in the order they were added. 

If no trade is in progress, it returns null. If there was an initial entry but no further DCA steps, it provides an array containing only the original entry price. You simply provide the symbol of the trading pair you're interested in, like 'BTCUSDT'.

## Function getPositionInvestedCount

getPositionInvestedCount lets you check how many times a position has been adjusted using a dollar-cost averaging (DCA) strategy. It tells you how many buy orders have been placed after the initial entry – 1 means just the first buy, and higher numbers represent subsequent DCA buys. If there’s no active trade currently being worked on, it will return null.  The function smartly figures out whether it’s running in a backtesting environment or a live trading session. You provide the symbol of the trading pair you're interested in (e.g., "BTCUSDT").


## Function getPositionInvestedCost

This function helps you figure out how much you've invested in a particular trading pair, like BTC/USD. 

It calculates the total cost based on all the times you’ve bought into that position. This cost is tracked when you use the `commitAverageBuy` function.

If there’s no active trading signal for that symbol, the function will return null.

It automatically adjusts to whether you're in a backtest or live trading environment.

You simply provide the trading pair symbol to the function to get the invested cost.


## Function getPositionHighestProfitTimestamp

This function helps you find out when a specific trading position reached its highest profit point. It tells you the exact timestamp – a date and time – when that peak profit occurred for a given trading pair, like BTC/USD or ETH/USDT.

Essentially, it looks back at a position's history and identifies the moment it was most profitable.

If there's no historical data for that position, the function will return null, indicating it can’t determine the highest profit timestamp. You provide the trading pair symbol as input to specify which position you're interested in.

## Function getPositionHighestProfitPrice

This function helps you find the highest price your position has reached while being profitable. It essentially remembers the best price that worked in your favor since you started the trade.

For long positions, it tracks the highest price above your entry price. For short positions, it tracks the lowest price below your entry price.

You'll get a number representing that peak profit price.  If no trade is currently active, the function won't return a value. But once a trade is open, you're guaranteed to get a result – at the very least, your initial entry price.

The function requires you to specify the trading pair symbol, like 'BTC/USDT'.

## Function getPositionHighestProfitMinutes

This function helps you understand how long a trade has been running since it reached its best possible profit. 

It tells you the number of minutes that have passed since the price was at its highest point for that particular trading pair.

Think of it as a way to gauge how far a trade has fallen from its peak performance – a longer number means a bigger pullback.

If no trade signals are active for that symbol, the function will return null.

You just need to provide the symbol (like 'BTCUSDT') to get this information.

## Function getPositionHighestProfitDistancePnlPercentage

This function helps you understand how far your trading position has strayed from its most profitable point. It calculates the difference between the highest profit percentage achieved so far and the current profit percentage. 

Essentially, it tells you how much "wiggle room" you might have before you reach your best potential outcome.

If there's no active trading signal, the function won't be able to provide a value and will return null. You'll need to specify the trading pair's symbol to use this function, like "BTCUSDT".

## Function getPositionHighestProfitDistancePnlCost

This function helps you understand how far your current trading position is from its best possible profit. It calculates the difference between the highest profit your position could have achieved and what it's currently making. If no trading signal is pending for the specified trading pair, the function will return null. Essentially, it's a way to gauge how much room for improvement there is in your current trade. You provide the symbol of the trading pair you’re interested in, and the function returns a number representing that distance in profit and loss cost.

## Function getPositionHighestProfitBreakeven

This function checks if a trading position could have reached a breakeven point at its highest profit level. It essentially determines if the price movement allowed for a recovery to cover costs at the peak of profitability.

If there's no active trading signal for the given symbol, the function will return null, indicating that the breakeven calculation isn't applicable.

You provide the trading pair symbol (like BTCUSDT) to see if breakeven was possible.


## Function getPositionHighestPnlPercentage

This function helps you understand the performance of a specific trading position. 

It tells you the highest percentage profit achieved by that position at its peak. 

You provide the trading symbol – like "BTCUSDT" – and it will return that peak profit percentage.

If there's no ongoing or past signal related to that symbol, it will return null, indicating that no data is available.

## Function getPositionHighestPnlCost

This function helps you understand the financial performance of a specific trading position. It looks back at a position's history and identifies the point where the profit was the highest. It then tells you the total cost associated with reaching that peak profit, expressed in the currency used for trading that symbol. If no trading signals exist for a symbol, the function will return null. You simply provide the trading symbol as input, and it gives you a valuable snapshot of the position's profit journey.


## Function getPositionHighestMaxDrawdownPnlPercentage

This function helps you understand how much your trading position has lost from its peak. 

It calculates the largest percentage drop from the highest point your position has reached, relative to its current profit or loss. 

Essentially, it shows you how far your profits have fallen.

If there's no active trade signal for a given symbol, the function won't return a value.

You provide the trading symbol – like "BTC-USDT" – to find this information for that specific trading pair.


## Function getPositionHighestMaxDrawdownPnlCost

This function helps you understand how far your trading position is from its lowest point in terms of profit and loss. It calculates the difference between your current profit and loss and the lowest profit and loss experienced during a drawdown. Essentially, it shows you the "distance" you've recovered from a previous loss. If there isn't a trading signal currently active, the function won't return a value. You just need to provide the symbol of the trading pair to get this information.


## Function getPositionEstimateMinutes

This function helps you understand how long a trading position is expected to last. 

It gives you an estimate, in minutes, of the original duration set when a trading signal was created.

Think of it as checking how much time is left before a position might automatically close due to a time limit.

If there isn't a currently active trading signal, the function will return null.

You provide the trading pair's symbol (like BTC-USDT) as input to find the relevant estimate.

## Function getPositionEntryOverlap

This function helps you avoid accidentally making multiple DCA entries at nearly the same price. It checks if the current market price falls within a small range around any of your existing DCA entry levels. 

Think of it as a safety net to prevent you from placing duplicate orders close to each other.

It determines if the current price is within a defined tolerance zone around each DCA level, calculated using a percentage-based step. If the current price overlaps with any of these zones, the function returns true, indicating potential redundancy. If there are no existing DCA levels, it returns false. You can also customize these tolerance zones using the `ladder` parameter.

## Function getPositionEntries

getPositionEntries lets you check the details of how a trade was built, specifically for the signal currently in progress. It gives you a list of the prices and costs associated with each step of building that trade – whether it’s the initial purchase or a subsequent DCA (Dollar Cost Averaging) buy. If there’s no active signal being worked on, it won’t return anything. If the signal was built with just one trade and no DCA, you'll get a list containing just one entry. Each entry will tell you the price at which that trade was executed and the dollar amount used for that particular step. You just need to provide the trading pair’s symbol (like BTCUSDT) to see this data.

## Function getPositionEffectivePrice

This function helps you understand the average entry price for your current trade, taking into account any dollar-cost averaging (DCA) adjustments. It calculates a weighted average based on how much you spent and the prices at which you bought. If you’ve partially closed your position, it figures out the price considering those closures. Essentially, it gives you a more accurate view of your overall cost basis than just the initial entry price, and returns null if no trade is in progress. It works whether you're running a backtest or a live trade.

You provide the trading pair symbol (like BTCUSDT) to get the price.

## Function getPositionDrawdownMinutes

getPositionDrawdownMinutes tells you how much time has passed since your current position reached its best possible price. 

Think of it as a measure of how far your profit has retreated. 

It starts at zero when your position first hits its peak profit, and then increases as the price moves downward. 

If there's no active trading signal, this function will return null, meaning there’s no position to evaluate.

You provide the trading pair, like "BTCUSDT", to get the drawdown time for that specific trade.

## Function getPositionCountdownMinutes

This function helps you understand how much time is left before a trading position expires. It calculates this by looking at when the position was initially flagged and comparing it to a projected expiration time.

If the position hasn't expired yet, you'll get the remaining minutes. If it *has* expired, the function will tell you zero.

You won’t get a value back if there’s no pending signal for that specific trading pair. 

To use it, just provide the symbol of the trading pair (like "BTC-USDT").


## Function getPositionActiveMinutes

getPositionActiveMinutes lets you check how long a particular trade has been open. It gives you the duration in minutes, calculated from when the position initially started. 

If there isn't a signal currently waiting for execution, the function will indicate that by returning null. To use it, you simply provide the trading pair's symbol as input.

## Function getPendingSignal

This function lets you check if a trading strategy currently has a pending order waiting to be filled. It retrieves the details of that pending signal, if one exists. If there's nothing waiting, it simply tells you that by returning null. The function smartly figures out whether it's running in a backtesting environment or a live trading situation without you having to specify. You only need to provide the symbol of the trading pair you’re interested in.

## Function getOrderBook

This function lets you retrieve the order book for a specific trading pair, like BTCUSDT, from the trading platform you're using. 

You can specify how many levels of the order book you want to see – more levels give you a more detailed view. 

It automatically considers the current time when fetching the data, which is crucial for accurate backtesting or real-time trading. The platform will handle how that time information is used depending on whether it's a backtest or a live trading situation.


## Function getNextCandles

This function helps you grab a batch of future candles for a specific trading pair and time interval. It's designed to get candles that come *after* the point in time that your backtest or strategy is currently at. Think of it as looking ahead to see what the market did next. 

You tell it which trading pair you're interested in (like BTCUSDT), how frequently the candles should be (e.g., every minute, every hour), and how many candles you want to retrieve. The function then uses the underlying exchange's methods to fetch those future candles.

## Function getMode

This function tells you whether the backtest-kit is currently running in backtest mode or live trading mode. It returns a promise that resolves to either "backtest" or "live", so you can adjust your logic based on the current environment. This is useful for things like debugging or disabling certain features during live trading.

## Function getMinutesSinceLatestSignalCreated

This function helps you figure out how much time has passed since the last trading signal was generated for a specific trading pair. 

It calculates the time in minutes, giving you a whole number representing the elapsed time. 

Whether the signal is still active or has already been closed doesn't matter – it just looks at the timestamp of the most recent signal. This is handy if you need to implement cooldown periods after events like a stop-loss trigger.

The function first checks your historical backtest data, and if it can't find anything there, it looks at current live data. If no signals exist for that symbol, it will return null. 

It automatically adapts to whether you're running a backtest or live trading. You just need to provide the symbol (like BTCUSDT) you're interested in.

## Function getMaxDrawdownDistancePnlPercentage

This function helps you understand the risk profile of a trading strategy by calculating the maximum drawdown. It essentially measures the largest percentage drop from a peak profit to a subsequent low point in the strategy's performance. The result represents how far a strategy's profit could potentially fall from its highest point.

It takes the trading symbol as input, like "BTC-USDT". 

If there are no signals generated for the given symbol, it won't return a value.


## Function getMaxDrawdownDistancePnlCost

This function helps you understand the risk profile of a trading strategy by calculating the maximum drawdown distance in terms of profit and loss. It essentially measures the difference between the highest profit achieved and the lowest point the strategy dipped to. 

Think of it like this: if your strategy made a profit of $100, then lost $50, this function would calculate the distance as $50. 

The result indicates the maximum potential loss from a peak profit position. If there are no active trading signals, the function won't be able to compute this value and will return null.

You need to provide the trading pair symbol, like "BTCUSDT," as input to this function.

## Function getLatestSignal

This function helps you retrieve the most recent trading signal for a specific asset, whether it's still active or has already been closed. It's handy for things like preventing rapid trading – for example, you could use it to pause new trades for a certain amount of time after a stop-loss is triggered, simply by looking at the signal's timestamp. The function looks in both the historical data and the live data to find this signal, and it will return nothing if no signal exists. Importantly, it automatically figures out if you're running a backtest or a live trade. You provide the trading pair symbol to specify which asset you're interested in.

## Function getFrameSchema

The `getFrameSchema` function lets you look up the structure and details of a specific frame within your backtest. Think of it as a way to get the blueprint for how a particular part of your backtest is organized. You give it the name of the frame you're interested in, and it returns a description of what that frame contains – its data, the operations it performs, and how it all fits together. This is useful for understanding and validating the setup of your backtesting environment.


## Function getExchangeSchema

The `getExchangeSchema` function helps you find details about a specific cryptocurrency exchange that your backtesting system is using. You give it the name of the exchange, like "binance" or "coinbase", and it returns a set of rules and information defining how that exchange works. This schema includes things like the format of trade data and the types of instruments offered. It’s useful for ensuring your backtesting strategies are compatible with the exchanges you're simulating.


## Function getDefaultConfig

This function gives you a starting point for setting up your backtesting environment. It provides a set of default values for various settings related to things like candle fetching, order execution, signal generation, and report generation. Think of it as a template – you can look at these defaults and then customize them to fine-tune your backtesting process. It's a good way to understand all the possible configuration options available to you.

## Function getDefaultColumns

This function provides a set of predefined column configurations used to generate markdown reports. It returns a set of default column definitions, detailing the structure and options available for displaying different types of data like closed trades, heatmap rows, live data, partial fills, breakeven points, performance metrics, risk events, scheduled events, strategy events, synchronization events, highest profit events, maximum drawdown events, walker's P&L, and walker's strategy results. You can think of it as a blueprint for how your data will be organized and presented in the report. This is useful for understanding what columns you can use and what their default behaviors are.

## Function getDate

This function, called `getDate`, gives you the current date based on where your trading strategy is running. If you're running a backtest, it will return the date associated with the specific timeframe being analyzed. When your strategy is running live, it provides the actual, real-time date. Essentially, it's a reliable way to know what date your strategy is operating on.

## Function getContext

This function gives you access to the current method's environment. Think of it as a snapshot of what's happening during a particular step in your backtest. It provides useful information like method details, allowing you to understand the current state of the trading simulation. You can use it to access data related to the execution context of your backtesting methods.

## Function getConfig

This function lets you peek at the settings controlling how your backtest runs. It gives you a snapshot of all the configuration values, like how often things are checked, limits on data processing, and various display options. Importantly, it provides a copy of these settings, so you can look at them without accidentally changing the actual running configuration. Think of it as a read-only window into how your backtesting environment is set up.

## Function getColumns

This function gives you a peek at how your backtest data will be presented in the final report. It provides a list of column configurations for different data types like trade results, heatmaps, live data, and more. Think of it as a way to see exactly what data fields are being used and how they’re organized before you generate your report, but without changing anything. It returns a copy, so your existing configurations remain safe.

## Function getCandles

This function lets you retrieve historical price data, or "candles," from a trading exchange. You provide the symbol of the asset you're interested in (like BTCUSDT), the time interval for the candles (like 1 minute, 1 hour, etc.), and how many candles you want to see. The function then goes back in time from the current market context to pull that data. It relies on the underlying exchange's specific method for getting candles.

Essentially, it's your way to access past price movements for analysis or backtesting.


## Function getBreakeven

This function helps determine if a trade has reached a point where any potential losses would be covered by the profit already made. It looks at the symbol being traded and the current market price to see if the price has moved enough to compensate for transaction costs and a small amount of slippage. The calculation considers a built-in threshold based on preset percentages for slippage and fees. It handles whether the system is in a testing or live trading environment without needing any special setup. You provide the trading symbol and the current price, and the function tells you if the breakeven point has been surpassed.

## Function getBacktestTimeframe

This function helps you find out the dates available for backtesting a specific trading pair, like BTCUSDT. It fetches a list of dates representing the timeframe for which historical data is available for that symbol. You can use this to ensure your backtest covers a valid and complete period. Essentially, it tells you which dates you can use when you're testing your trading strategies on past data.


## Function getAveragePrice

This function, `getAveragePrice`, figures out the Volume Weighted Average Price (VWAP) for a specific trading pair, like BTCUSDT. It looks at the last five minutes of trading data, specifically the high, low, and closing prices to determine a typical price for each minute. Then, it calculates the VWAP by weighting those typical prices by the volume traded at those prices, providing a sense of the average price adjusted for trading activity. If there's no trading volume during that time, it simply calculates the average of the closing prices instead. You just need to provide the symbol of the trading pair you're interested in.

## Function getAggregatedTrades

This function allows you to retrieve a list of combined trades for a specific trading pair, like BTCUSDT. It pulls this data directly from the exchange that's been set up in your backtest environment.

By default, it fetches trades from the past, going back a limited time window to ensure efficiency. If you want only a certain number of trades, you can specify a `limit`; otherwise, it will retrieve a reasonable amount based on how recent the data needs to be. The function effectively paginates through the trade history to get the number of trades you need.

## Function getActionSchema

This function helps you find the blueprint for a specific action within your trading strategy. Think of it like looking up the definition of a verb – it tells you what that action *does* and what inputs it expects. You give it the name of the action you're interested in, and it returns a detailed description of that action’s structure, including the expected data types. This is useful when you need to understand what data a particular action requires to function correctly.


## Function formatQuantity

This function helps you display quantities correctly when trading. It takes a symbol like "BTCUSDT" and a numerical quantity and transforms it into a string formatted to match the specific rules of the exchange you’re using. This ensures that your displayed quantities always show the right number of decimal places, avoiding errors or confusion. It handles the complexities of different exchange formatting so you don't have to.


## Function formatPrice

This function helps you display prices in the correct format for a specific trading pair. It automatically handles the number of decimal places needed based on the exchange’s rules, so you don't have to worry about formatting them yourself. Simply provide the trading symbol, like "BTCUSDT," and the raw price value, and it will return a formatted string representing that price. This ensures your displayed prices are accurate and consistent with the exchange's standards.

## Function dumpText

The `dumpText` function lets you send raw text data – think log messages or reports – to a specific storage location. It’s designed to associate this data with the currently active trading signal, so you can easily trace back events to a particular trade. 

It automatically figures out which signal it’s related to. If there isn't a signal active, it will let you know it couldn't proceed.

You'll provide a data package that includes the bucket name, a unique identifier for the data, the text content itself, and a descriptive label. The function then handles the process of sending this text to the storage system.


## Function dumpTable

This function helps you display data in a clean, table format within your backtesting environment. It takes an array of objects, essentially rows of data, and presents them neatly. The function automatically figures out the column headers by looking at all the properties used in your data.

It's designed to work specifically with signals in your backtest. It looks for the current signal being processed, and if one isn't found, it'll let you know with a warning. Think of it as a quick way to inspect the contents of a data bucket during your backtest runs.

The `dto` object you provide contains the data (rows), a bucket name, a unique dump ID, and a brief description.


## Function dumpRecord

This function helps you save a record of data, like a snapshot of information at a particular moment during a trading simulation. It’s useful for detailed analysis and debugging. The record is associated with a specific "bucket" and given a unique identifier. 

It automatically figures out which trading signal this record belongs to. If no signal is active, it will let you know. 

You provide the function with the record itself, a description of what the record represents, the bucket name, and a dump ID. The function then saves this record for later review.


## Function dumpJson

The `dumpJson` function is a handy tool for saving complex data structures – think of them as nested objects – as neatly formatted JSON. 

It essentially takes your data and packages it into a self-contained block of JSON text, associating it with a specific signal.

This signal provides context, helping you track where the data came from and when it was generated.

If there's no active signal available, it will just skip the process and let you know with a warning, so you don’t accidentally lose your data. You’ll need to provide the bucket name, a unique identifier for the dump, the JSON data itself, and a description for what that data represents.


## Function dumpError

This function lets you report detailed error information related to a specific trading signal. Think of it as a way to create a record of what went wrong, including a description of the problem. It automatically identifies the signal it applies to, so you don't have to specify it directly. If no signal is active, you’ll see a notification that the error report wasn't saved. The error report includes a unique identifier and the signal's name, along with the error description you provide.


## Function dumpAgentAnswer

This function helps you save the complete conversation history with the agent, specifically tied to a particular trading signal. It automatically figures out which signal it belongs to, pulling the signal ID from the current trading process. If there's no active signal, it'll let you know with a warning but won't proceed with the save. You provide the details of what you want to save, like the bucket name, a unique ID for the dump, the agent's messages, and a short description.


## Function commitTrailingTakeCost

This function lets you change the take-profit price for a trade to a specific level. It simplifies the process of setting a fixed take-profit by automatically calculating the correct percentage shift based on the original take-profit distance. The system handles the details of whether it's running a backtest or a live trading session, and also gets the current price for accurate calculations. You just need to provide the symbol of the trading pair and the desired new take-profit price.

## Function commitTrailingTake

This function helps you fine-tune your take-profit orders as the market moves. It lets you adjust the distance of your take-profit order relative to where it was originally set.

It’s important to remember that this adjustment is always based on the initial take-profit level, not any subsequent changes. This prevents small errors from building up over time. 

When you call this function, if you’re trying to make your take-profit more conservative (closer to the entry price), the change will be accepted. However, if you’re trying to make it more aggressive (further from the entry price), it will only happen if the new value is actually more conservative than the existing one.

The function automatically figures out whether it’s running in backtesting or a live trading environment. You'll provide the symbol being traded, the percentage adjustment you want to make, and the current price.

## Function commitTrailingStopCost

This function lets you change the trailing stop-loss price for a specific trading pair to a set value. It simplifies the process of setting a stop-loss by automatically calculating the percentage shift needed relative to the original stop-loss distance. The function handles whether it's being used in a backtest or a live trading environment, and it also gets the current price of the trading pair to ensure the calculation is accurate. You just provide the symbol of the trading pair and the new stop-loss price you want.

## Function commitTrailingStop

The `commitTrailingStop` function lets you fine-tune a trailing stop-loss order. It’s used to modify the distance of your stop-loss relative to the initial stop-loss you set.

It's really important to remember that this function works based on the original stop-loss distance, not the current, potentially adjusted one, to avoid problems that can happen when you repeatedly change things.

The `percentShift` value determines how much to adjust the stop-loss distance. A negative value moves the stop-loss closer to your entry price (tightening it), while a positive value moves it further away (loosening it).  If you give it a smaller `percentShift`, it will only apply the change if it actually improves your protection – it won't make your stop-loss worse.

For long positions, it will only allow you to loosen the stop-loss, and for short positions, it will only allow you to tighten it.

The function also intelligently figures out whether it’s running in a backtesting environment or a live trading scenario.

You’ll need to provide the trading symbol, the percentage adjustment you want to make, and the current price to evaluate potential intrusion.

## Function commitSignalNotify

This function lets you send out informational notifications about what your trading strategy is doing. Think of it as a way to leave notes for yourself, or send alerts to other systems, without actually changing your positions. You can use it to mark key events, like when a specific indicator triggers, or to simply log what your strategy is up to.

It handles some of the details for you – it knows whether you're in backtesting or live trading, and it automatically includes information like your strategy's name, the exchange, and the current price.

You provide the symbol of the trading pair (like "BTCUSDT") and can add extra details to your notification through the payload parameter. This payload allows you to customize the information included in the notification.


## Function commitPartialProfitCost

The `commitPartialProfitCost` function lets you partially close a trading position when you’ve made a certain profit in dollar terms. It’s a simpler way to take profits compared to directly using `commitPartialProfit` because it handles the calculation of what percentage of your position that dollar amount represents. 

Essentially, you tell it how much money you want to gain back, and it figures out how much of your position to close to achieve that. This function is designed to work when the price is moving in a favorable direction, towards your target profit level.

It works seamlessly in both backtesting and live trading environments, and it automatically fetches the current price to ensure accurate calculations. To use it, you simply provide the symbol of the trading pair and the dollar amount you want to recover.

## Function commitPartialProfit

This function lets you automatically close a portion of your open trade when the price moves favorably, essentially locking in some profit. It's designed to help you gradually reduce your risk as the trade goes in your favor, moving you closer to your target profit. 

You specify which trading pair you're working with and what percentage of the position you want to close. The system intelligently figures out whether it's running in a historical backtest or a live trading environment, so you don't have to worry about that.

To use it, you'll need to provide the symbol of the trading pair and the percentage of the position you want to close, represented as a number between 0 and 100. Remember, the price has to be moving in the direction of your take profit for this to work.

## Function commitPartialLossCost

This function lets you partially close a trading position to limit losses, specifically when the price is trending in a direction that would trigger your stop-loss. It simplifies the process by allowing you to specify the dollar amount you want to recover, and it handles the calculations to convert that amount into a percentage of your original investment. The framework automatically determines whether it's running in a backtesting or live trading environment and fetches the current price to accurately execute the partial close. You provide the trading symbol and the dollar value of the position you want to close.


## Function commitPartialLoss

This function lets you automatically close a portion of your open trade when the price is moving in a direction that would trigger your stop-loss. 

It's designed to help you manage risk by reducing your exposure when a trade isn't going as planned. You specify the symbol of the trading pair and the percentage of your position you want to close. 

The function intelligently adapts to whether it's running in a backtesting environment or a live trading account, so you don’t need to adjust your code for different scenarios. Essentially, it's a way to proactively reduce losses by closing a part of your trade as it moves against you.


## Function commitClosePending

This function allows you to manually cancel a pending trade signal in your backtest or live trading environment. Think of it as a way to override a signal that your strategy generated but you don’t want it to execute. It effectively clears the "pending" signal for a specific trading pair.

Importantly, this action won't interrupt your strategy's overall operation or affect any signals that are already scheduled. The strategy will continue to analyze the market and generate new signals as usual. 

You can optionally provide additional details, like an ID and a note, when you cancel the signal, which might be helpful for tracking or analysis purposes. The framework automatically adapts to whether it's running in a backtesting or live trading scenario.

## Function commitCancelScheduled

This function lets you cancel a previously scheduled signal for a specific trading pair. Think of it as removing an order that's waiting to be triggered by a price movement.

It's designed to be a gentle cancellation - the strategy will continue running and can generate new signals, and any existing orders will remain untouched.

You can also include extra details with the cancellation, like an ID or a note for your records. The system automatically knows whether it's running a backtest or a live trading session.


## Function commitBreakeven

This function helps manage your trades by automatically adjusting the stop-loss once a certain profit level is reached. Essentially, it moves your stop-loss to the entry price, meaning you're no longer at risk of losing more than your initial investment. 

This happens when the price moves favorably enough to cover both slippage and trading fees. The specific price target for this move is calculated based on a couple of predefined percentages related to slippage and fees.

The function handles the complexities of knowing whether it's running a simulation (backtest) or a live trade, and it also retrieves the current price for you. You just need to specify the trading pair symbol.


## Function commitAverageBuy

The `commitAverageBuy` function helps you incrementally build a position using dollar-cost averaging. It essentially adds a new buy order to your strategy's record, spreading your investment over time.

It calculates the average entry price by factoring in the new buy. 

The function takes the trading symbol as input, and optionally a cost parameter. It automatically determines whether it’s running in a backtest or live environment and fetches the current price needed for the buy. Finally, it signals that a new average buy has occurred.


## Function commitActivateScheduled

This function lets you trigger a scheduled trading signal before the price actually hits the target price you initially set. It's like giving your strategy a head start. 

It essentially marks the signal as ready to activate, and the strategy will handle the actual trading execution on the next available price update. The function smartly adjusts its behavior depending on whether you're running a backtest or live trading.

You specify which trading pair (symbol) to affect and optionally include a note or ID with the activation.


## Function checkCandles

The `checkCandles` function is designed to verify that the timestamps of your historical candlestick data are aligned correctly, which is crucial for accurate backtesting. It performs this check by reading directly from the JSON files stored in your persistent storage. This bypasses any intermediate layers or abstractions, ensuring a direct and reliable validation process. Essentially, it helps you confirm that your data is organized in a way that your backtesting strategies can accurately interpret.


## Function addWalkerSchema

This function lets you register a custom walker, which is essentially a way to run backtests for several strategies simultaneously and then easily compare their results. Think of it as setting up a system to automatically test different trading approaches against the same historical data. 

You provide a configuration object, called `walkerSchema`, that tells the system how to run and evaluate these strategy comparisons. This is a key step if you want to analyze how different strategies stack up against each other.


## Function addStrategySchema

This function lets you tell the backtest-kit about a new trading strategy you want to use. It's like registering a new plugin for your backtesting system.

When you register a strategy, the framework will automatically check it to make sure it’s set up correctly – things like the prices it uses, how take profit and stop loss orders work, and that signals aren’t being sent too quickly.

It also helps ensure your strategy's data is saved safely even if there are unexpected problems during a live backtest.

To use it, you provide a configuration object that defines the details of your strategy.

## Function addSizingSchema

This function lets you tell the backtest framework how to determine the size of your trades. Think of it as setting up the rules for how much capital you’ll commit to each trade. You provide a sizing schema, which includes things like how you want to calculate position size – whether it’s a fixed percentage, based on the Kelly Criterion, or using Average True Range – and also details about risk and position limits. This helps ensure your trading strategy is managed responsibly by defining how much risk you're comfortable taking and setting boundaries for your positions. The sizing schema acts as a blueprint for calculating the appropriate trade size.


## Function addRiskSchema

This function lets you define how your trading system manages risk. Think of it as setting up rules to prevent you from taking on too much exposure. 

It's used to specify things like the maximum number of simultaneous trades you can have across all your strategies. 

You can also create more complex risk checks, like monitoring portfolio metrics or analyzing correlations between assets. 

Importantly, this risk configuration is shared among all your trading strategies, so you get a holistic view of your risk exposure. It also provides a way to automatically reject or allow trading signals based on pre-defined risk constraints.


## Function addFrameSchema

This function lets you tell the backtest-kit what kind of timeframes it should be looking at for your analysis. Think of it as defining the scope of your historical data – whether you're interested in daily, hourly, or even minute-by-minute data. You provide a configuration object that specifies the start and end dates for your backtest, the interval for creating timeframes (like one day or one hour), and a function that gets called whenever a new timeframe is generated. This allows the system to understand the timeframe generation logic you need for your strategy.

## Function addExchangeSchema

This function lets you tell the backtest-kit framework about a new exchange you want to use for your simulations. Think of it as registering a data source, so the framework knows where to get historical price data and how to interpret it.

You provide a configuration object, which defines details like how to fetch historical candle data, how to format prices and quantities, and how to calculate things like VWAP. This registration is essential for the framework to properly process and utilize data from your chosen exchange.

## Function addActionSchema

This function lets you tell backtest-kit about a custom action you want to run during a backtest or live trading session. Think of actions as little automated tasks that get triggered by specific events happening in your strategy—like when a trade is opened, closed, or hits a profit target.

You can use these actions to do all sorts of things, such as updating your state management tools, sending notifications to Slack or Telegram, keeping detailed logs, or even gathering data for performance analysis. 

Essentially, you're defining what should happen when certain things occur in your strategy's execution.  The `actionSchema` parameter tells the framework how to execute this specific action; it includes all the details needed to connect the action to the right strategy and frame.
