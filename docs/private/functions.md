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

## Function validate

This function, `validate`, is your safety net for ensuring everything is set up correctly before you run a backtest or optimization. It checks that all the entities your trading strategy relies on – like exchanges, trading frames, strategies, and sizing methods – actually exist and are properly registered within the system.

You can tell it specifically which entities to check, or you can let it do a full sweep and confirm *everything* is in place.  It’s designed to be quick, remembering past validation results so it doesn't have to repeat work unnecessarily. Think of it as a quick check to avoid frustrating errors later on!


## Function trailingTake

This function lets you fine-tune your take-profit levels for ongoing trades. It's designed to adjust the distance of your take-profit order based on a percentage change, always referencing the original take-profit distance you set when the trade began.

The key is that it prevents errors by always working from that original value, ensuring adjustments remain accurate over time.  If you're trying to make your take-profit more conservative (closer to your entry price), the function will take your input; if you try to make it more aggressive, it will ignore your request unless it moves the take-profit closer to the entry price.

For long positions, it only moves the take-profit closer; for short positions, it only moves it further.  It also automatically adapts to whether you're running a backtest or a live trade. 

You’ll need to provide the trading symbol, the percentage shift you want to apply, and the current market price to evaluate the adjustment.

## Function trailingStop

The `trailingStop` function helps you manage your stop-loss orders during backtesting or live trading. It allows you to adjust the distance of your trailing stop-loss, protecting your profits as the price moves in your favor. 

It's important to understand that this function works based on the *original* stop-loss distance you initially set, not any adjustments made since then. This ensures accuracy and prevents errors from building up over time.

You can tighten or loosen your stop-loss using a percentage shift. A negative shift brings the stop-loss closer to your entry price, while a positive shift moves it further away.  

The function is designed to be smart; it only adjusts your stop-loss if the new distance is actually better - meaning it offers more protection for your profits. For long positions, the stop-loss can only move upwards, and for short positions it can only move downwards. It automatically adapts to whether you're backtesting or trading live. 

You’ll need to provide the symbol of the trading pair, the percentage adjustment you want to make, and the current price of the asset.

## Function stop

This function lets you pause a trading strategy, effectively halting it from creating any new trading signals. It's useful when you need to intervene or temporarily stop a strategy's activity.  Existing open trades or signals will finish their lifecycle as normal. The system will gracefully stop, either when it’s idle or after a signal has completed, adapting to whether it’s running a backtest or a live trading scenario. To use it, you simply provide the symbol of the trading pair the strategy is operating on.

## Function setLogger

You can now plug in your own logging system to backtest-kit. This allows you to see exactly what's happening under the hood, with useful details like the strategy name, exchange, and trading symbol automatically included in each log message. Simply provide an object that conforms to the `ILogger` interface, and the framework will use it to handle all internal logging. It's a great way to debug and understand how your backtesting strategies are performing.

## Function setConfig

This function lets you adjust how backtest-kit operates. You can tweak certain settings to match your specific testing needs by providing a configuration object. Think of it as customizing the environment for your backtesting experiments. The `_unsafe` flag is a special option primarily for test environments, allowing you to bypass some safety checks during configuration.

## Function setColumns

This function lets you customize the columns that appear in your backtest reports when they're generated as markdown. You can change how information is displayed by providing your own column configurations, essentially tweaking the layout of the report. The system checks your new column definitions to make sure they're structurally sound, but there's a special flag you can use to skip this validation if you’re working in a test environment. It's a way to finely control the presentation of your backtesting results.

## Function partialProfit

This function lets you automatically close a portion of your open trade when it’s making a profit, moving closer to your target profit level. You specify the trading symbol and the percentage of the trade you want to close. It handles whether you're running a backtest or a live trade automatically, so you don't need to worry about that. Think of it as a way to secure some gains as your trade progresses favorably. You provide the symbol of the trading pair and the percentage you wish to close, such as 25 to close 25% of the position.

## Function partialLoss

This function lets you automatically close a portion of an open position when the price moves in a losing direction, essentially moving your stop-loss closer. You specify the trading symbol and the percentage of your position you want to close. The framework intelligently handles whether it's running in backtesting or live trading mode, so you don't need to worry about that. Think of it as a way to reduce your risk by taking profits or limiting losses incrementally. 

It’s useful for managing positions where you want to gradually reduce exposure without completely exiting the trade. Remember to provide a valid symbol and a percentage between 0 and 100 to represent the portion of the position to close.

## Function listWalkers

This function allows you to see all the different "walkers" that are currently set up within the backtest-kit framework. Think of walkers as reusable components that process your trading data – this gives you a way to list them all. It’s helpful if you want to understand what’s happening behind the scenes, generate documentation, or build tools that automatically adapt to the walkers you’re using. The function returns a promise that resolves to an array of descriptions detailing each registered walker.

## Function listStrategies

This function helps you discover all the trading strategies that are currently set up within the backtest-kit framework. It gives you a list of descriptions for each strategy, allowing you to see what's available. This is really handy when you’re trying to understand your system, create documentation, or build user interfaces that let you choose between different strategies. Essentially, it provides a peek under the hood at the strategies you've defined.

## Function listSizings

This function lets you see all the sizing methods currently set up within the backtest-kit framework. Think of it as a way to inspect the rules that determine how much of an asset you'll trade based on different conditions. It provides a list of configurations, which is helpful when you're trying to understand how your trading strategy is structured or if you want to build tools that adapt to different sizing approaches. Essentially, it's a peek under the hood at the sizing logic.

## Function listRisks

This function helps you discover all the risk assessments your backtest-kit setup is using. It fetches a list of registered risk schemas, essentially giving you a peek under the hood at how risks are being evaluated. Think of it as a way to confirm your risk configurations are loaded correctly or to generate a display showing all the potential risks being considered during a backtest. It returns a promise that resolves to an array of risk schema objects.

## Function listOptimizers

This function lets you see all the different optimization strategies currently available within your backtest-kit setup. Think of it as a way to peek under the hood and understand what options you have for fine-tuning your trading algorithms. It gives you a list of configurations, each describing a specific optimizer, which can be helpful for troubleshooting or building tools that dynamically display optimization choices. Basically, it provides a comprehensive overview of the optimizers you've added to the system.

## Function listFrames

This function gives you a look at all the different "frames" – think of them as data structures – that your backtest kit is using. It's like getting a directory listing of all the ways data is organized within your trading simulation. You can use this information to check what's going on behind the scenes, generate documentation, or even build tools that adapt to the specific frames in use. Essentially, it provides a comprehensive view of the data organization your backtest relies on.

## Function listExchanges

This function lets you see a complete list of the exchanges your backtest-kit setup knows about. It's like getting a directory of all the places your trading strategies can connect.  You can use this information to check if your exchanges are properly configured, create documentation describing your supported exchanges, or even build a user interface that adapts to the exchanges you're using. The function returns a promise that resolves to an array of exchange schema objects, each detailing an exchange.

## Function listenWalkerProgress

This function lets you keep track of how a backtest is progressing, especially when you're running multiple strategies. It provides updates after each strategy finishes executing during a `Walker.run()`.

Importantly, these updates are handled one at a time, even if your callback function takes some time to process each update. This ensures that things don't get out of sync and that the updates are processed in the order they arrive. 

You provide a function as input, and this function will be called with details about the progress of each strategy.  The function you provide will return another function, which you can use to unsubscribe from these updates later on.

## Function listenWalkerOnce

This function lets you set up a temporary listener for walker events – think of it as a one-time alert. You provide a filter to specify which events you're interested in, and a function that will run *only once* when a matching event occurs. After that single execution, the listener automatically disappears, so you don't need to worry about cleaning up. It's perfect for situations where you need to react to a specific walker condition and then move on.

You tell it which events to look for using a filter function. 
Then, you specify the action – the function – that should be performed when a matching event is found.

## Function listenWalkerComplete

This function lets you be notified when a backtest run, managed by the `Walker` component, finishes.  It's useful for triggering actions after all your trading strategies have been tested.  The notification happens when `Walker.run()` is done processing all strategies.  Crucially, the code inside your notification function will be executed one at a time, even if it involves asynchronous operations, ensuring things happen in the order they're received. Think of it as a guaranteed, sequential notification when your backtesting is complete.

## Function listenWalker

The `listenWalker` function lets you keep an eye on how a backtest is progressing. It’s like setting up a notification system that gets triggered after each strategy finishes running within a backtest.  You provide a function that will be called with information about the strategy's completion. Importantly, these notifications are handled in order and processed one at a time to avoid any unexpected behavior when your notification function might take some time to complete. Think of it as a safe and reliable way to track the backtest's advancement.

## Function listenValidation

This function lets you keep an eye on any problems that pop up during the risk validation process. Think of it as setting up a listener that alerts you whenever something goes wrong while checking your signals. It’s great for spotting and fixing issues as they happen, making debugging much easier. The alerts are delivered one at a time, ensuring things stay organized, even if your error handling code takes some time to run. To use it, you provide a function that will be called whenever a validation error occurs, and it will return a function to unsubscribe from the listener.

## Function listenSignalOnce

This function lets you set up a listener that reacts to specific trading signals, but only once. It's perfect when you need to wait for a particular condition to be met and then take action. You provide a filter – a test that determines which signals you’re interested in – and a function to execute when that signal arrives. Once the signal passes the filter and your function runs, the listener automatically stops listening, ensuring it doesn’t trigger again.


## Function listenSignalLiveOnce

This function lets you quickly react to specific trading signals coming from a live backtest. You provide a filter – a rule that determines which signals you're interested in – and a function to execute when a matching signal arrives.  It's designed for one-time use; it automatically subscribes to the signals, runs your function once when a match is found, and then unsubscribes, keeping your code clean and preventing unwanted repeated actions.  Essentially, it's a convenient way to listen for and respond to a single, specific event within a live backtest execution.


## Function listenSignalLive

This function lets you tap into a stream of live trading signals coming directly from a running backtest. Think of it as setting up a listener that gets notified whenever a signal is generated during a live backtest run.  It's specifically designed to work with signals produced by `Live.run()`.  The events are delivered one at a time, in the order they happen, so you can be sure you're processing them sequentially, which can be useful for certain kinds of analysis or adjustments. To use it, you provide a function that will be called with each signal event, giving you the data you need to react. When you're done listening, the function returns another function that you can call to unsubscribe.

## Function listenSignalBacktestOnce

This function lets you react to specific signals generated during a backtest, but only once. It's perfect for situations where you need to do something just one time based on a particular event happening in the backtest. You provide a filter to specify which signals you’re interested in, and a function to execute when that signal appears.  Once the function runs, it automatically stops listening, so you don't have to worry about manually unsubscribing. It only works with events coming from a `Backtest.run()` execution.

## Function listenSignalBacktest

This function lets you tap into the backtest process and react to signals as they happen. Think of it as setting up an observer to watch what's going on during the backtest simulation. It provides a way to receive updates about each 'tick' or event within the backtest execution, ensuring you get them in the order they occurred. You pass in a function that will be called with each signal, allowing you to build custom logic to respond to these events. The function you provide will be executed asynchronously. When you are finished listening, the function it returns can be called to unsubscribe.


## Function listenSignal

This function lets you tap into the flow of trading signals generated by backtest-kit. It's a way to react to events like when a strategy becomes idle, opens a position, is actively trading, or closes a position. The cool part is that it handles these events in order, one after another, even if your reaction code takes some time to run – you won't have multiple signals triggering at once. You simply provide a function that will be called with the details of each signal event. When you’re done listening, the function returns another function that you can call to unsubscribe.

## Function listenRiskOnce

This function lets you react to specific risk rejection events just once. It's like setting up a temporary alert – you tell it what kind of event you're looking for, and when it happens, it triggers your callback function. Once the callback runs, the function automatically stops listening, so you don't get any further notifications. This is really handy if you need to take action based on a particular risk condition and then move on.

You provide a filter function that checks if an event meets your criteria, and a callback function that handles the event when it's matched. The function then silently unsubscribes after the callback is executed.

## Function listenRisk

This function lets you keep an eye on when your trading signals are being blocked because they violate risk rules. It’s like setting up an alert system that only goes off when something *bad* happens – specifically, when a signal gets rejected due to risk checks.

You provide a function that will be called whenever a signal is rejected, and this function will handle the details of that rejection. 

Importantly, this system makes sure those alerts aren't overwhelming. It only sends them when necessary (no spam!), and it processes them one at a time, even if your alert function takes some time to complete. This ensures things are handled in a controlled and orderly way.


## Function listenPingOnce

This function lets you react to specific ping events and then automatically stop listening. Think of it as setting up a temporary alert – you specify what kind of ping you're looking for, provide a function to run when you see it, and then the system takes care of cleaning up after itself. This is helpful when you only need to respond to a ping once and don’t want to keep listening afterwards. You give it a filter to identify the relevant ping and a function to execute when that ping occurs.

## Function listenPing

This function lets you keep an eye on the status of your trading signals as they're waiting to become active. Think of it as a heartbeat signal – it sends you a notification every minute while a signal is in that "waiting" phase. You provide a function that will be called with each ping event, allowing you to monitor the signal's lifecycle or implement your own custom checks. It's a way to confirm things are running smoothly behind the scenes. The function returns a cleanup function to unsubscribe from these pings when you no longer need them.

## Function listenPerformance

This function lets you keep an eye on how quickly your trading strategies are running. It's like attaching a performance monitor to your code. Whenever your strategy performs an action, this system will send you updates about how long it took. 

These updates, called "PerformanceContract" events, are delivered one at a time, even if the code you provide to handle them takes a while to complete. This ensures things stay organized and prevents unexpected issues caused by multiple callbacks running at once. You can use this to find and fix slow parts of your strategy and generally optimize its speed. To use it, you simply provide a function that will be called with each performance event.


## Function listenPartialProfitOnce

This function lets you react to specific partial profit events within your backtest, but only once. You provide a condition – a filter – to define what kind of profit event you're looking for, and a function to execute when that event happens. Once the condition is met, the callback runs, and the listener automatically stops, ensuring it only triggers once for a given event type. This is handy if you need to perform a specific action the very first time a particular profit level is reached.


## Function listenPartialProfit

This function lets you keep track of your trading progress as you reach profit milestones like 10%, 20%, or 30% gains.  It's designed to be reliable, even if the function you provide to handle these milestones takes some time to complete because it handles events one at a time. You give it a function that will be called whenever a profit milestone is hit, and it returns another function that you can use to unsubscribe later when you no longer need to listen for these events.

## Function listenPartialLossOnce

This function lets you set up a one-time alert for specific partial loss events within your backtest. You provide a filter – a rule to identify the events you're interested in – and a function to execute when that event happens. Once the event matching your filter occurs, the function runs your callback and then automatically stops listening, ensuring you only react once to that particular condition. This is handy if you need to trigger a specific action the moment a certain loss threshold is reached.

## Function listenPartialLoss

This function lets you monitor your trading strategy's progress in terms of losses. It will notify you when the strategy hits certain loss milestones, like experiencing 10%, 20%, or 30% losses.

The great thing is that the notifications are handled in order, and even if your callback function does something that takes time (like an asynchronous operation), the system ensures that these notifications are processed one at a time, avoiding any potential conflicts. You simply provide a function that will be called whenever a partial loss event occurs, and this function will receive information about that loss. When you're done listening, the function returns another function that you can call to unsubscribe.

## Function listenOptimizerProgress

This function lets you keep an eye on how your trading strategy optimizer is doing. It sends updates as the optimizer works, showing you the progress of data source processing. These updates arrive in the order they happen, and the system makes sure your code handling them runs one step at a time, even if it needs to do some extra work before finishing. To use it, you provide a function that will be called whenever an update is available, and it will return a function to unsubscribe from these updates later.

## Function listenExit

This function lets you be notified when the backtest-kit framework encounters a critical error that will stop everything. Think of it as a safety net for unexpected problems during a background process, like a backtest or live trading simulation. Unlike handling regular errors, these are serious issues that cause the process to end. The notifications you receive will be processed one at a time, even if your error handling code involves asynchronous operations. This ensures that errors are handled in the order they happen, and prevents any race conditions. To use it, you provide a function that will be called when a fatal error occurs. This allows you to log the error, attempt a graceful shutdown, or take other corrective actions.


## Function listenError

This function lets you set up a system to catch and deal with errors that happen while your trading strategy is running, but aren't severe enough to stop everything. Think of it as a safety net for temporary hiccups, like a failed connection to an exchange. It makes sure these errors don't crash your strategy, and it processes them one at a time, even if your error handling involves some extra work. You provide a function that will be called whenever an error of this type occurs.

## Function listenDoneWalkerOnce

This function lets you react to when a background task finishes within backtest-kit, but only once. You provide a filter to decide which finishing events you’re interested in, and then a function that will run exactly one time when a matching event occurs. After that function runs, the subscription is automatically removed, so you don't need to worry about cleaning it up yourself. It's a convenient way to perform a one-off action when a specific background process concludes. 

Essentially, you’re setting up a short-lived listener that gets triggered and then disappears.


## Function listenDoneWalker

The `listenDoneWalker` function lets you be notified when background tasks managed by a Walker finish processing. It's a way to keep track of what's happening behind the scenes. Whenever a Walker’s background execution is done, this function will call your provided callback function. To prevent issues, it makes sure your callback runs one at a time, even if it involves asynchronous operations. The events are delivered in the order they occurred. 

You provide a function (`fn`) that will be executed when a Walker background task is complete. The return value of `listenDoneWalker` is a function that, when called, will unsubscribe you from these completion events.

## Function listenDoneLiveOnce

This function lets you react to when a background task within your backtest finishes, but only once. You provide a filter – a way to specify which completed tasks you're interested in – and a callback function that will be executed when a matching task is done. Once the callback runs, the subscription is automatically removed, so you don't have to worry about cleaning it up. It’s a clean way to handle single, specific completion events from background processes.


## Function listenDoneLive

This function lets you listen for when background tasks, started with `Live.background()`, finish running. It's useful if you need to react to the completion of these tasks and want to ensure your reactions happen in a specific order.  The function gives you a callback that you provide; this callback will be called whenever a background task is done. Importantly, the callback is handled in a way that prevents multiple callbacks from running at the same time, ensuring sequential processing even if your callback itself performs asynchronous operations. To stop listening, simply call the function that `listenDoneLive` returns.

## Function listenDoneBacktestOnce

This function lets you set up a listener that gets notified when a background backtest finishes, but only once. You provide a condition – a filter – to specify which backtest completions should trigger the notification. Then, you give it a function that will run once when a matching backtest is done. After that function runs, the listener automatically disappears, so you don't have to worry about cleaning it up. 

Essentially, it's a convenient way to react to a specific backtest completion just once and then forget about it.


## Function listenDoneBacktest

This function lets you be notified when a background backtest finishes running. It’s like setting up a listener that waits for a specific task to complete.  When the backtest is done, the function you provide will be called, and it will handle the details of the finished backtest. Importantly, these notifications happen one after another, even if your handling function takes some time to process – this ensures things stay organized and prevents issues from running things at the same time. To stop listening, the function returns another function that you can call.

## Function listenBreakevenOnce

This function lets you set up a one-time alert for specific breakeven conditions. You provide a filter that defines which events you're interested in, and a function that will be executed just once when a matching event occurs.  Once the function runs, it automatically stops listening, so you don't need to worry about manually unsubscribing. It’s a handy way to react to a particular breakeven situation and then forget about it. 

The filter you provide acts as a sieve, only letting events through that meet your criteria. The provided callback function then handles those events, giving you a chance to respond to the specific condition you're looking for.

## Function listenBreakeven

This function lets you keep an eye on when your trades reach a breakeven point – that's when the price moves enough to cover all the costs associated with your trade, and your stop-loss is automatically adjusted to the entry price.  You provide a function that will be called whenever this happens.  Importantly, the events are handled one at a time, even if your function takes some time to complete, ensuring things don't get messy. Think of it as a way to be notified when a trade has essentially paid for itself.


## Function listenBacktestProgress

This function lets you keep an eye on how a backtest is progressing. It's like setting up a notification system that tells you about the backtest's status as it runs in the background. 

The backtest kit will send progress updates to a function you provide. Importantly, these updates are handled one at a time, even if your notification function takes a little while to process each one, ensuring things don’t get out of order or overwhelmed. 

You'll receive these updates during the `Backtest.background()` phase. The function you give it is called whenever a progress event happens. When you're done listening, the function returns another function that you can call to unsubscribe.

## Function hasTradeContext

This function quickly tells you if the environment is ready for trading actions. It verifies that both the execution and method contexts are set up correctly. Think of it as a gatekeeper - it confirms that everything needed to interact with the exchange, like fetching data or formatting prices, is in place before you proceed. If it returns true, you're good to go; if not, you'll need to ensure the necessary contexts are initialized.

## Function getMode

This function tells you whether the backtest-kit framework is currently running in backtest mode or live trading mode. It's a simple way to check the context of your code – are you analyzing historical data or actively executing trades? The function returns a promise that resolves to either "backtest" or "live", giving you a clear indication of the operating environment.

## Function getDefaultConfig

This function provides you with a set of pre-configured settings for the backtest-kit framework. Think of it as a starting point – it gives you sensible defaults for things like slippage percentages, candle retry counts, and maximum signal lifespans.  You can examine the returned values to understand what options are available for customizing your backtesting environment.  It’s a quick way to see what the framework expects to function properly without needing to define every single parameter yourself.

## Function getDefaultColumns

This function gives you a peek into the default structure of columns used to generate reports within the backtest-kit framework. It provides a predefined set of columns for different report sections, like closed trades, heatmaps, live data, and performance metrics. Think of it as a blueprint – it shows you all the available column types and their initial settings, which you can then customize for your specific reporting needs. You can use this to understand the options available and build your own tailored reports.

## Function getDate

This function, `getDate`, provides a simple way to retrieve the current date within your trading strategy. It’s useful for time-based decisions, like scheduling actions or analyzing historical data relative to the current point in time.  Whether you’re running a backtest or live trading, this function will give you the relevant date – in backtesting it's the date of the timeframe you’re currently analyzing, and in live mode it's the real-time date. It returns a promise that resolves to a JavaScript `Date` object.

## Function getConfig

This function lets you peek at the global settings used by the backtest-kit framework. It gives you a snapshot of values like candle averaging parameters, slippage and fee percentages, and limits on signal generation and retry attempts. Importantly, it provides a copy of the configuration, so you can look at the values without changing the actual settings being used by the system. Think of it as a read-only window into how the backtest is being run.

## Function getColumns

This function gives you a look at the columns that will be used to build your backtest reports. Think of it as getting a snapshot of how your data will be organized in the final report. It provides definitions for columns related to strategy ticks, heatmap data, live events, partial events, breakeven points, performance metrics, risk assessments, scheduled tasks, walker signals, and strategy results. Importantly, it returns a copy, so you can examine the configuration without changing the original settings.

## Function getCandles

This function helps you retrieve historical price data, also known as candles, for a specific trading pair. You tell it which trading pair you're interested in, like "BTCUSDT" for Bitcoin against USDT, and how frequent the candles should be – options include intervals like every minute, every 3 minutes, or every hour.  The function then pulls that data back from the exchange you're connected to, giving you a set number of candles to analyze. Think of it as requesting a history log of price movements for a particular asset.

## Function getAveragePrice

This function helps you figure out the average price a symbol has traded at, using a method called VWAP. It looks at the last five minutes of trading activity to do this calculation. Specifically, it considers the high, low, and closing prices of each minute, multiplies those by the volume traded, and then averages them all out.  If there's no trading volume available, it just calculates a simple average of the closing prices instead. To use it, you simply provide the trading pair symbol, like "BTCUSDT".

## Function formatQuantity

This function helps you display the right amount of assets when placing orders. It takes a trading pair like "BTCUSDT" and a numerical quantity as input. The function then automatically adjusts the quantity to match the specific formatting rules of the exchange you're using, making sure the decimal places are correct. This simplifies order placement and avoids potential errors caused by incorrect quantity formatting.

## Function formatPrice

This function helps you display prices in a way that’s correct for the specific trading pair you're working with. It takes a symbol like "BTCUSDT" and a price as input, then uses the exchange's rules to format the price properly, ensuring the right number of decimal places are shown.  Essentially, it makes sure your price displays look professional and accurate. You provide the trading pair and the numerical price, and it handles the formatting details for you.


## Function dumpSignal

This function helps you save detailed records of your AI trading strategy's decisions. It's designed for strategies that use AI to generate trading signals, allowing you to later review exactly what happened.

It takes the signal ID, the entire conversation history with the AI, and the final signal generated as input. The function then organizes this information into a folder containing files that describe the system prompt, each user message, and the AI's final output along with the trading signal details.

To prevent accidentally erasing older logs, it won't create a folder if one already exists for that signal ID. You can specify a custom directory to store these logs, or it will default to a folder named "dump/strategy" within your project. This feature is invaluable for debugging and understanding how your AI strategy arrived at its conclusions.


## Function cancel

This function lets you remove a scheduled signal from your trading strategy without interrupting the overall process. Think of it as hitting the pause button on a specific signal, not the entire strategy. You can use it to cancel signals that are waiting for a certain price level to trigger. 

It’s important to know that canceling a signal doesn’t impact any signals that are already active, nor does it stop your strategy from creating new signals.  If you want to track which cancellations were initiated by you, you can provide a unique identification number along with the symbol. This function works seamlessly whether you're backtesting or running live trades.

## Function breakeven

This function helps automate your trading strategy by adjusting your stop-loss order. It shifts your stop-loss to the entry price – essentially a zero-risk position – once the price moves in your favor enough to cover the costs of the trade, including slippage and fees. The specific level at which this happens is determined by a calculation that factors in those costs. The function cleverly handles whether it’s running in a backtesting environment or a live trading scenario and automatically obtains the current price for accurate calculations. You just need to provide the symbol of the trading pair you're working with.

## Function addWalker

This function lets you add a "walker" to your backtest kit setup. Think of a walker as a way to run several trading strategies against the same historical data and see how they stack up against each other. You provide a configuration object, the `walkerSchema`, which defines how the walker will execute the backtests and what metrics you want to use to compare the strategies. Essentially, it streamlines the process of benchmarking different trading approaches.

## Function addStrategy

This function lets you tell backtest-kit about a new trading strategy you've built. Think of it as registering your strategy so the framework knows how to use it. When you add a strategy, the system will check to make sure your strategy's signals are valid—things like the prices, take profit/stop loss rules, and timestamps all make sense. It also helps prevent your strategy from sending too many signals too quickly.  If you're running in live mode, your strategy’s data will be saved safely even if something unexpected happens. You provide a configuration object, called `strategySchema`, that defines how your strategy works.

## Function addSizing

This function lets you tell the backtest-kit how to determine the size of your trades. Think of it as setting up the rules for how much capital you'll allocate to each position. You provide a configuration that outlines your sizing method—whether it's a fixed percentage of your capital, a Kelly Criterion approach, or something based on Average True Range (ATR)—and the specific parameters for that method. You can also set limits on how much you're willing to risk on a single trade and define callbacks to run custom logic during sizing calculations. Essentially, it's the key to controlling your risk and portfolio size during backtesting.

## Function addRisk

This function lets you set up how your trading strategies manage risk. It's like establishing guardrails to prevent taking on too much exposure. 

You define the maximum number of trades that can be active at once, and can also add your own custom checks for more complex risk scenarios – things like looking at how different strategies affect your overall portfolio.

The framework uses a central risk manager that all your strategies share, so it can assess risk across everything you're trading. This lets you build in rules that can block or allow trades based on the overall risk picture.


## Function addOptimizer

This function lets you add a custom optimizer to the backtest-kit framework. Think of an optimizer as a way to automatically create and refine trading strategies. It pulls data, crafts prompts for a language model, and uses those prompts to generate entire backtest setups – essentially, it writes the code for your trading experiments. You provide a configuration object that tells the framework how your optimizer works, and it handles the rest, setting up the pieces needed for automated strategy creation.

## Function addFrame

This function lets you tell backtest-kit how to create the timeframes it will use for running your trading strategies. Think of it as defining the scope and granularity of your backtest – when it starts, when it ends, and how often it generates data points. You provide a configuration object, `frameSchema`, which specifies the start and end dates of your backtest, the interval (like daily, hourly, or minute-by-minute), and a function to handle any events that happen during timeframe generation. Essentially, you're setting up the basic timeline for your backtesting process.

## Function addExchange

This function lets you tell backtest-kit about a new data source for trading, like Binance or Coinbase. You provide a configuration object that describes how to fetch historical price data, how to format prices and quantities, and how to calculate things like the VWAP (Volume Weighted Average Price) based on recent trades. Essentially, it's how you integrate different exchanges into your backtesting environment. This registration allows the framework to use that exchange's data for simulations and analyses.
