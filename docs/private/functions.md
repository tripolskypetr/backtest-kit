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

This function helps you make sure everything is set up correctly before you start running backtests or optimizations. It checks that all the different components you're using – like exchanges, trading strategies, and risk management systems – are properly registered within the backtest-kit framework.

You can tell it specifically which components to check, or if you leave it blank, it will verify *everything*. This is great for a complete checkup to avoid errors later on. The system remembers the results of previous validations, which speeds things up if you run it multiple times.

## Function trailingTake

This function helps you manage your take-profit levels for open trades, specifically for trailing take-profit strategies. It lets you adjust the distance of your take-profit order from the initial take-profit level you set when you entered the trade.

It's important to understand that this function always calculates adjustments based on the original take-profit distance, not the current trailing take-profit level. This is to prevent errors from building up if you call this function repeatedly.

When you adjust the take-profit distance, the function prioritizes being conservative. If you're trying to move your take-profit further away (more aggressively), it will only do so if the new level is closer to the entry price than your current take-profit.

For long positions, it only brings the take-profit closer to the entry price. For short positions, it only moves the take-profit further away from the entry price.

The function automatically adapts to whether you're running a backtest or a live trade.

You need to provide the symbol of the trading pair, the percentage adjustment you want to make to the original take-profit distance (which can be positive or negative), and the current market price.

## Function trailingStop

This function helps you manage trailing stop-loss orders for your trades. It allows you to dynamically adjust the distance of your stop-loss, which is crucial for protecting profits while letting your trade run.

The key thing to remember is that it always calculates the stop-loss distance based on the original stop-loss level you set when the trade was initiated, not the current trailing stop-loss value. This prevents small errors from building up each time you adjust it.

You specify the symbol you're trading, the percentage by which you want to adjust the stop-loss (a negative value moves it closer to your entry price, a positive value moves it further away), and the current market price to check against.

Importantly, the function is designed to only improve your stop-loss protection; if the new adjustment wouldn't be a better outcome (more profit protection), it won’t be applied. For long positions, it only allows you to move the stop-loss further away from your entry price, and for short positions, it only allows you to move it closer. This framework automatically knows whether it's running in a backtesting or live trading environment.


## Function stop

This function lets you pause a trading strategy. It essentially tells the strategy to stop creating new trading signals. Any existing trades will finish up, but the strategy won't open anything new. The system will handle stopping the process gracefully, whether it's running a backtest or a live trade. You just need to specify the symbol of the trading pair you want to halt.

## Function setLogger

This function lets you plug in your own logging system to backtest-kit. It’s useful if you want to direct log messages to a specific file, database, or service instead of the default console output. When you provide your own logger, backtest-kit will automatically add helpful context like the trading strategy name, exchange used, and the symbol being traded to each log message, making it easier to understand what’s happening during your backtests. You simply need to create an object that fulfills the `ILogger` interface and pass it to this function.


## Function setConfig

This function lets you adjust how the backtest-kit framework behaves. Think of it as fine-tuning the engine before you start running simulations. You can modify certain settings to tailor the backtesting environment to your specific needs.  If you're working in a testing environment, there's a special option to bypass some safety checks, which is useful for controlled tests. The configuration object you pass in only needs to include the settings you want to change; it doesn't require you to redefine everything.

## Function setColumns

This function lets you customize the columns that appear in your backtest reports, like those generated for markdown. Think of it as tailoring the report to show exactly the data you want to see. You can adjust the default column definitions, changing what's displayed and how.  The system checks that your column configurations are valid, but you can bypass this validation if needed, mainly when working in a testbed environment.

## Function partialProfit

This function lets you automatically close a portion of your open trade when it's making a profit, moving closer to your target profit level. It’s designed to help you lock in some gains along the way. You tell it which trading pair you’re dealing with (like BTCUSDT) and what percentage of your position you want to close, for example, 25% or 50%.  The framework figures out if it's running a backtest or a live trade, so you don't have to worry about that. This feature is useful for managing risk and securing profits as your trade progresses.

## Function partialLoss

This function lets you close a portion of an open trade when the price is heading in the direction of your stop-loss. Think of it as a way to reduce your risk by partially exiting a position that's moving against you. You specify the trading symbol and the percentage of the position you want to close, and the function handles whether it's running in a backtesting environment or a live trading scenario. It’s a useful tool for managing risk and potentially softening losses on trades. Remember to provide the symbol and the percentage you wish to close.

## Function listWalkers

This function gives you a peek behind the scenes, showing you all the different "walkers" that are currently set up within the backtest-kit framework. Think of walkers as reusable components for analyzing and manipulating data during a backtest. By calling this function, you'll get a list of descriptions for each walker, which can be handy for understanding how your backtest is configured, creating helpful documentation, or even building tools that automatically adapt to the walkers in use. It's a straightforward way to see what's going on under the hood.


## Function listStrategies

This function helps you discover all the trading strategies that your backtest-kit setup knows about. It gives you a list of strategy descriptions, which include things like their name, what data they need, and how they work. Think of it as a way to see what's available for your backtesting or to display a menu of strategies to a user. This is particularly helpful when you're testing different approaches or want to dynamically present options.

## Function listSizings

This function lets you see all the different ways your trading strategy can handle order sizes. Think of it as a way to check what sizing rules are currently active. It gives you a list of configurations, making it handy for troubleshooting, understanding your system’s behavior, or creating interfaces that reflect these sizing options. Essentially, it reveals all the sizing schemas you've added to your backtest-kit setup.

## Function listRisks

This function allows you to see all the risk assessments your backtest kit is currently configured to handle. Think of it as a way to peek under the hood and understand what kinds of potential problems the system is looking for. It gathers all the risk schemas you’ve previously added and presents them in a neat list, which can be very helpful for troubleshooting or creating interfaces that display these risk factors. You can use this to confirm your risk assessments are set up correctly or to generate documentation about them.


## Function listOptimizers

This function lets you see all the optimization strategies that are currently set up within your backtest environment. Think of it as a way to get a complete inventory of the different methods you're using to fine-tune your trading strategies. You can use this list to understand what's happening under the hood, create documentation, or even build interactive tools to explore these optimizers. It's a straightforward way to discover the available optimization options.

## Function listFrames

This function lets you see a complete list of all the data structures, or "frames," that your backtest kit is using. Think of it as a directory of all the different types of data you’re working with in your trading strategy.  It’s helpful if you’re trying to understand what’s going on behind the scenes, building tools to visualize your data, or just making sure everything is set up correctly.  The function returns a promise that resolves to an array, where each item describes one of those registered frames.

## Function listExchanges

This function allows you to see a full list of the exchanges that your backtest-kit environment knows about. It essentially provides a directory of all the configured trading platforms. You can use this to confirm your exchanges are set up correctly, generate a list for reference, or dynamically build user interfaces that adapt to available exchanges. The function returns a promise that resolves to an array containing information about each registered exchange.

## Function listenWalkerProgress

This function lets you keep track of how a backtest is progressing, especially when you're running many strategies. It provides updates after each strategy finishes within the backtest run. The updates are delivered in the order they happen, and the framework makes sure your code processing these updates isn't overwhelmed by running things simultaneously. Essentially, you give it a function to call when a strategy completes, and it handles the timing and order of those calls for you. You can think of it as a way to receive progress notifications from your backtest.


## Function listenWalkerOnce

This function lets you set up a listener that reacts to events happening within a process, but only once. You provide a filter – a way to identify the specific events you're interested in – and a callback function that will be executed when a matching event is found.  After the callback runs, the listener automatically stops, making it perfect for scenarios where you need to wait for a particular condition to be met and then take action. Essentially, it's a one-time alert system for events.


## Function listenWalkerComplete

This function lets you be notified when the backtest process finishes running all your strategies. It's like setting up a listener that waits for the entire testing sequence to complete.  Importantly, the notifications happen one at a time, even if the code you provide to handle the notification takes some time to run. This ensures things happen in the order they were received and prevents potential conflicts from running things simultaneously. You give it a function that will be called when the backtest is done, and it returns a way to unsubscribe from those notifications later if you need to.

## Function listenWalker

This function lets you keep an eye on how your backtest is progressing. It's a way to be notified when each strategy finishes running within a Walker.run() execution. The notifications happen one at a time, ensuring that any actions you take based on these updates won’t interfere with the backtesting process itself, even if your notification handling involves asynchronous operations. You provide a function that will be called with details about each completed strategy. The function you provide will return a function that you can use to unsubscribe from the walker progress events.

## Function listenValidation

This function allows you to keep an eye on potential problems during risk validation. It's like setting up a notification system that alerts you whenever a validation check fails and throws an error.

These errors, which often pop up during signal checking, are sent to your provided function one at a time, ensuring they're handled in the order they occur.  The system makes sure that your error handling logic runs safely, even if it involves asynchronous operations. Think of it as a way to debug and monitor your risk validation processes quietly in the background.

You give it a function to handle these errors, and it returns another function which you can use to unsubscribe from these notifications later.

## Function listenSignalOnce

This function lets you temporarily "listen" for specific trading signals and react to them just once. You tell it what kind of signal you're looking for using a filter – essentially, a rule that defines the conditions you want to match. Once a signal that fits your rule arrives, the provided callback function will run, and then the function automatically stops listening, ensuring it only acts on that single event. This is handy when you need to react to a specific signal and then move on without constantly monitoring. 

It's like setting up a temporary alert that only goes off once for a particular scenario.

The function takes two parts: the rule to identify the signal you're waiting for, and the action you want to take when that signal arrives. It returns a function that, when called, will remove your listener.

## Function listenSignalLiveOnce

This function lets you temporarily listen for specific signals coming from a live trading simulation. Think of it as setting up a short-term listener that only cares about certain events. It’s perfect for situations where you need to react to a signal just once, like logging a specific condition or running a quick calculation. Once the callback function has executed, the listener automatically stops, so you don't have to worry about managing subscriptions manually. You tell it what kind of signals to look for (using `filterFn`) and what to do when it finds one (using `fn`).


## Function listenSignalLive

This function lets you tap into the live trading signals being generated by backtest-kit. Think of it as setting up a listener that gets notified whenever a new signal is ready. The signals are delivered one after another, ensuring they're processed in the order they occur during a live trading simulation.  You provide a function that will be called with each signal, allowing you to react to them in real time. Importantly, this only works with signals generated during a `Live.run()` execution, not historical data.

## Function listenSignalBacktestOnce

This function lets you listen for specific signals generated during a backtest run, but only once. It’s useful when you need to react to a particular event just a single time without needing to keep listening. You provide a filter that determines which signals you're interested in, and then a function that will be executed when a matching signal appears. After the callback runs once, it automatically stops listening, so you don’t have to worry about cleaning up manually. It works only with events from the `Backtest.run()` function.


## Function listenSignalBacktest

This function lets you tap into the stream of data generated during a backtest run. It's a way to listen for events as the backtest progresses and react to them.  You provide a function that will be called whenever a backtest signal event occurs, and it handles these events in the order they come. Importantly, it only works with events produced by the `Backtest.run()` method. The provided function receives the tick result as an argument. When you're done listening, the function returns another function that you can call to unsubscribe.

## Function listenSignal

This function lets you easily keep track of what's happening with your trading strategy by providing a way to react to key events like when it's idle, opening a position, actively trading, or closing a position.  It’s designed to be simple: you give it a function that will be called whenever one of these events occurs. Importantly, the function you provide will be processed one at a time, in the order they arrive, ensuring that any asynchronous operations within your function won't cause unexpected issues or conflicts. This makes it reliable for handling events and keeping your strategy running smoothly.


## Function listenRiskOnce

This function lets you temporarily watch for specific risk rejection events and react to them just once. You provide a filter that defines what kind of event you're interested in, and a function to run when that event occurs. Once the function executes, the listener automatically stops, so you don’t have to worry about managing subscriptions. It's a handy way to respond to a particular risk condition and then move on.

Here's a breakdown:

*   You tell it what to look for (`filterFn`).
*   You specify what should happen when it finds it (`fn`).
*   It only runs your code once and then silently stops listening.

## Function listenRisk

This function lets you be notified when a trading signal is blocked because it violates risk rules. Think of it as an alert system specifically for when something goes wrong with your risk management. You provide a function that will be called whenever a signal is rejected, and this function will ensure that those calls happen one at a time, in the order they come in. It’s designed to only alert you about *rejected* signals, so you won't get overwhelmed with notifications about signals that pass your risk checks.



The function returns another function that you can use to unsubscribe from these risk rejection events whenever you need to stop listening.

## Function listenPingOnce

This function lets you set up a listener that reacts to specific "ping" events, but only once. You provide a filter – a condition that determines which pings you're interested in – and a function to execute when a matching ping arrives.  After that one execution, the listener automatically stops, so you don’t have to worry about manually unsubscribing. It’s handy when you need to wait for a particular ping signal to happen just one time and then react. The filter function examines each incoming ping event, and the callback function handles the single ping that passes the filter.

## Function listenPing

This function lets you keep an eye on the progress of your trading signals as they're waiting to be activated. Essentially, it provides a way to check in on them regularly – about every minute – while they're in a “pending” state. You can think of it as a heartbeat signal. 

You give it a function that will be called whenever a ping event happens. This allows you to build your own custom monitoring or tracking logic to understand exactly what’s happening with your signals as they prepare to trade. When you're done listening for these pings, the function returns another function that you can call to unsubscribe and stop receiving them.

## Function listenPerformance

This function lets you keep an eye on how quickly your trading strategies are running. It provides performance data during execution, which is really helpful for spotting slowdowns and areas where your code might be inefficient. Think of it as a way to profile your strategy and fine-tune its speed. When you subscribe to performance events, they’ll be delivered one at a time, even if the function you provide to handle them takes some time to complete. This ensures things stay orderly and prevents unexpected issues.

## Function listenPartialProfitOnce

This function lets you react to specific partial profit events in your backtest, but only once. You provide a rule – a filter – to define what kind of profit event you’re interested in, and a function to run when that event happens.  Once the function runs, it automatically stops listening for similar events, making it perfect for scenarios where you need to trigger something just once based on a specific profit condition. Think of it as a temporary alert for a particular profit level. It simplifies handling single, targeted responses to trading events.


## Function listenPartialProfit

This function lets you monitor your trading strategy's progress towards profitability. It will notify you when the strategy hits certain profit milestones, like 10%, 20%, or 30% gains. Importantly, these notifications happen in the order they occur, and even if your callback function takes some time to process, the framework ensures things don't get jumbled up. You provide a function that gets called each time a profit milestone is reached, and this function will receive information about the event. The function you provide will return a function that can be used to unsubscribe from these events later.

## Function listenPartialLossOnce

This function helps you react to specific partial loss events in your backtest, but only once. You tell it what kind of loss event you're looking for using a filter – essentially, a rule to identify the events you care about. Once an event that matches your rule happens, the function runs the code you provide as a callback, and then it automatically stops listening, ensuring it only triggers once. It's a handy way to handle situations where you need to respond to a particular loss condition just one time.


## Function listenPartialLoss

This function lets you keep track of how much your trading strategy has lost during a backtest. It provides notifications when the losses reach specific milestones, like 10%, 20%, or 30% of the initial capital. 

Crucially, the updates are processed one at a time, ensuring your code handles them in the correct order, even if your callback function needs to do some asynchronous work. This is helpful for ensuring consistent and predictable behavior as your strategy experiences losses.

You simply provide a function that will be called whenever a loss milestone is reached, and this function will return a way to unsubscribe from those events later.


## Function listenOptimizerProgress

This function lets you keep an eye on how your trading strategy optimizer is doing. It provides updates as the optimizer works through its data, allowing you to track its progress.  The updates are delivered one at a time, even if the function you provide to handle them takes some time to process. This ensures the updates are handled in the order they arrive, preventing any unexpected issues from happening simultaneously. You give it a function that will receive these progress updates, and it returns another function you can use to stop listening when you no longer need those updates.

## Function listenExit

This function lets you be notified when something goes seriously wrong and stops the backtest-kit processes like background tasks. It's specifically for errors that cause the entire system to halt, unlike the `listenError` function which handles problems you can recover from.  When a fatal error occurs, your provided function will be called, and it's designed to handle these errors in a controlled, sequential manner, even if your function itself takes some time to complete. Essentially, it's a way to catch and respond to critical failures in your backtesting environment. The function returns an unsubscribe function, allowing you to stop listening for these exit events when you no longer need to.


## Function listenError

This function helps you keep your trading strategies running smoothly, even when things go wrong. It allows you to register a function that will be called whenever a recoverable error occurs during the strategy's execution—think of it as catching those little bumps in the road. The errors are handled without stopping the entire process, allowing your strategy to continue operating. Importantly, these errors are handled one at a time, in the order they happen, ensuring a predictable and reliable error handling process. You provide a function to deal with each error, and this function will be executed to manage the error.

## Function listenDoneWalkerOnce

This function lets you react to when a background task within your backtest finishes, but it only triggers once and then stops listening. You provide a filter – a way to specify which completed tasks you're interested in – and a function that will be executed when a matching task is done. Think of it as setting up a single, targeted notification for a specific kind of background process completion. After the callback runs, the listener is automatically removed, so you don't need to worry about cleaning up.


## Function listenDoneWalker

This function lets you listen for when a background task within the backtest-kit framework finishes running. It's designed to handle situations where you need to react to the completion of these tasks, ensuring that your responses happen in the order they’re received. The function provides a way to safely process completion events, even if your response involves asynchronous operations, preventing potential conflicts. It returns a function that you can call later to unsubscribe from these completion notifications.

## Function listenDoneLiveOnce

This function lets you react to when a background task finishes running within your backtest. You provide a filter to specify exactly which completed tasks you're interested in, and a callback function that will be executed just once when a matching task finishes.  After that one execution, the subscription automatically stops, so you don’t have to worry about managing it. It’s a simple way to get notified about the completion of specific background processes in your trading simulations.

## Function listenDoneLive

This function lets you be notified when background tasks run by the Live system finish. Think of it as subscribing to updates about what's happening behind the scenes.  When a background task completes, a special event is sent to your provided function, ensuring these updates happen one at a time, even if your function needs to do some work before acknowledging it. It's useful for keeping track of asynchronous processes within your trading framework.

## Function listenDoneBacktestOnce

This function lets you react to when a background backtest finishes, but in a special way – it only runs your code once. You provide a filter to specify which backtest completions you're interested in, and a function to execute when a matching completion happens. After your function runs once, it automatically stops listening, so you don't have to worry about manually unsubscribing. It's a handy way to perform a single action after a specific backtest completes.

Essentially, it's a one-time listener for backtest completion events based on your criteria.


## Function listenDoneBacktest

This function lets you be notified when a backtest finishes running in the background. It's great for triggering actions after a backtest completes, like saving results or displaying a summary. The important thing to know is that these notifications are processed one at a time, even if your notification code takes some time to run, ensuring things stay organized and don't interfere with each other. You provide a function that will be called when the backtest is done, and this function returns another function you can use to unsubscribe from these notifications later.

## Function listenBreakevenOnce

This function lets you watch for specific breakeven protection events and react to them just once. Think of it as setting up a temporary listener that only fires when a particular condition is met. You provide a filter to define which events you're interested in, and a function to run when that event occurs. Once the event happens and your function runs, the listener automatically stops, so you don’t need to worry about cleaning it up. It's handy when you only need to respond to a breakeven situation one time.


## Function listenBreakeven

This function lets you keep track of when your trading signals automatically adjust their stop-loss to breakeven. It's designed to notify you when the price has moved favorably enough to cover the costs of the trade, and the stop-loss is then moved back to the original entry price. The system ensures these notifications are handled one at a time, even if your notification process takes some time, so you won't miss anything. You provide a function that will be called with details about each time this breakeven protection kicks in.

## Function listenBacktestProgress

This function lets you keep an eye on how your backtest is progressing. It gives you updates as the backtest runs, allowing you to track its status and potentially display progress information.  These updates are delivered in order, and even if the function you provide takes some time to process each update, the updates will still be handled one at a time to ensure smooth operation. You provide a function that will be called with each progress update, and this function returns another function which you can call to stop listening for those updates.

## Function hasTradeContext

This function helps you determine if your code is running within a trading environment where actions can be executed. It essentially verifies that both the execution and method contexts are set up correctly. If it returns true, it means you're in a good position to safely use functions that interact with the exchange, like fetching candle data or formatting prices. Think of it as a quick check to ensure everything is ready for a trade-related operation.

## Function getMode

This function lets you easily find out whether your code is running in backtesting mode or in a live trading environment. It returns a simple promise that resolves to either "backtest" or "live", giving you a clear indication of the context your trading logic is operating within. This is useful for adapting your strategies based on whether you're simulating trades or executing real ones.

## Function getDefaultConfig

This function gives you a peek at the standard settings used within the backtest-kit framework. Think of it as a template – it provides a set of default values for various configuration options. It's a handy way to understand what settings you *can* adjust and what their typical starting points are when you're setting up a backtest. The values returned are read-only, so you can’t directly change them; you’ll use this as a base to create your own customized configuration.

## Function getDefaultColumns

This function provides a quick way to see the standard column setup used for generating reports within the backtest-kit framework. It gives you a look at the pre-defined columns for various data types, like closed trades, heatmaps, live ticks, and performance metrics.  Think of it as a peek under the hood to understand how columns are structured and what options are typically used when building your own reporting configurations. You can use this to inspire your own custom column setups or simply to understand the available defaults.

## Function getDate

This function, `getDate`, simply tells you what the current date is within your trading simulation or live trading environment. If you're running a backtest, it gives you the date associated with the timeframe you're analyzing. Otherwise, if you're trading live, it provides the actual, real-time date. It's a straightforward way to access the date relevant to your trading logic.

## Function getConfig

This function lets you peek at the framework's global settings. Think of it as a way to see how the backtest is currently configured – things like slippage percentages, fee amounts, and retry delays for fetching data. It's designed to be read-only, so you can't accidentally change the settings while looking at them; it gives you a safe copy to examine. This is helpful for understanding the environment your strategies are operating in and troubleshooting any issues.

## Function getColumns

This function provides a snapshot of the columns used for generating reports within the backtest-kit framework. It gathers information about the columns displayed in various reports, including those for closed trades, heatmaps, live data, partial fills, breakeven calculations, performance metrics, risk assessments, scheduled events, walker signals, and strategy results. The returned data is a copy, ensuring that any changes you make won't affect the framework's internal column configurations. Think of it as a way to peek under the hood and see what's being used for your reports.

## Function getCandles

This function lets you retrieve historical price data, also known as candles, for a specific trading pair. You tell it which symbol you're interested in, like "BTCUSDT" for Bitcoin against USDT, and how frequently you want the data, like every minute or every hour.  It will then grab a certain number of candles—you specify that limit—going back from the current time. Essentially, it's a straightforward way to pull past price movements for your analysis or trading strategies. The data it retrieves comes directly from the exchange you've configured within backtest-kit.

## Function getAveragePrice

This function helps you figure out the average price of a trading pair, like BTCUSDT. It uses a method called VWAP, which considers both the price and the trading volume to give a more accurate picture of the average. The calculation looks at the last few minutes of trading activity to determine this average.  If there's no trading volume during that time, it falls back to a simpler average of the closing prices instead. You just need to provide the symbol of the trading pair you're interested in, and it will return the calculated average price.

## Function formatQuantity

This function helps you prepare quantity values for trading, making sure they follow the specific rules of the exchange you're using. It takes a trading symbol, like "BTCUSDT," and a raw quantity number as input. The function then uses the exchange’s own formatting logic to ensure the quantity has the correct number of decimal places, avoiding potential trading errors. Essentially, it handles the technical details of quantity formatting so you don’t have to.

## Function formatPrice

This function helps you display prices in the correct format for a specific trading pair. It takes the symbol of the trading pair, like "BTCUSDT", and the raw price value as input.  Then, it automatically uses the exchange's rules to format the price, ensuring that the correct number of decimal places are shown, based on the specific exchange you’re using. This makes sure your displayed prices look accurate and consistent with how the exchange presents them.

## Function dumpSignal

This function helps you save detailed records of your AI trading strategy's decision-making process. It takes the conversation between your AI and the system, along with the trading signal it generated, and neatly organizes them into markdown files. Think of it as creating a comprehensive debug log for each trade.

It will create a folder named after a unique identifier you provide (like a UUID) within a default output directory, or one you specify. Inside that folder, you'll find files detailing the initial system prompt, each individual message exchanged, and the final trading signal.

The function is smart enough to avoid accidentally deleting any existing logs, so it won't overwrite previously saved data. It’s particularly useful for analyzing why your AI made certain trading choices and for troubleshooting any issues that might arise.

Here's what you need to give it:

*   A unique identifier for each trade result.
*   The full conversation history from your AI's interaction.
*   The actual trading signal (like entry price, take profit, stop loss).
*   Optionally, you can tell it where to save these files.

## Function cancel

This function lets you cancel a previously scheduled signal, essentially removing it from the queue without interrupting your trading strategy's overall operation. Think of it as saying, "Don't execute that signal I set up earlier."  It's useful if you've changed your mind or want to adjust your plan.  The function handles whether you’re in a backtesting or live trading environment automatically. You can optionally provide a cancellation ID to keep track of which cancellations you initiated. It won't affect any signals that are already active, nor will it stop the strategy from creating new signals.


## Function breakeven

This function helps manage your trading risk by automatically adjusting your stop-loss order. It essentially moves your stop-loss to the entry price – essentially making your position risk-free – once the price has moved in your favor enough to cover the costs associated with the trade, like slippage and fees. The specific level the price needs to reach is calculated based on those costs. The function figures out whether it's running in a backtest or live trading environment and grabs the current price for calculations. You just need to provide the symbol of the trading pair you're interested in.

## Function addWalker

The `addWalker` function lets you register a custom walker, which is essentially a tool for comparing different trading strategies against each other. Think of it as setting up a controlled experiment where multiple strategies are tested on the same data to see which performs best. You provide a configuration object, the `walkerSchema`, that defines how the walker should operate, specifying things like the metric used for comparison. This function helps you rigorously evaluate and benchmark your trading strategies.

## Function addStrategy

This function lets you register a new trading strategy with the backtest-kit system. Think of it as telling the framework about a new way to generate trading signals. When you add a strategy, it’s checked to make sure the signals it produces are reasonable and follow the rules you’ve set. 

It also ensures that signals aren't sent too frequently and that the strategy's data can be safely stored even if something goes wrong during a live backtest. You’ll provide a configuration object describing how your strategy works when you call this function.

## Function addSizing

This function lets you tell backtest-kit how to determine the size of your trades. You provide a configuration object that outlines your sizing method, such as fixed percentage, Kelly Criterion, or ATR-based sizing.  It includes details like your acceptable risk level, multipliers for calculations, and any limits you want to put on position sizes. Essentially, it's how you define your risk management strategy within the backtesting environment.


## Function addRisk

This function lets you set up how your trading strategies manage risk. Think of it as defining the guardrails for your automated trading system. You can specify limits on how many trades can be open at once and even create custom checks to ensure your portfolio remains healthy, considering things like correlations between different assets. This risk configuration is shared across all your strategies, allowing for a holistic view of your risk exposure. It enables sophisticated risk management and helps prevent unintended consequences in your trading.


## Function addOptimizer

This function lets you register a custom optimizer within the backtest-kit framework. Think of an optimizer as a system that automatically generates trading strategies – it gathers data, uses language models to craft prompts, and then builds complete, runnable backtesting scripts.  Essentially, you provide a configuration describing your optimizer, and backtest-kit will integrate it into the system, allowing it to generate those strategies. The configuration includes all the necessary components, like how to handle data, interact with language models, and manage the backtesting process itself.

## Function addFrame

This function lets you tell backtest-kit about a specific timeframe you want to use for your backtesting. Think of it as defining a period and frequency – like saying, "I want to backtest data from January 1st, 2023, to December 31st, 2023, with 1-hour intervals."

You’ll provide a configuration object that outlines the start and end dates of your backtest, the interval between data points (like hourly, daily, weekly), and any special functions that need to be run when the timeframe changes. This registration step is crucial for setting up the timeline your backtesting strategy will operate on.


## Function addExchange

This function lets you tell backtest-kit about a new data source for trading, like a cryptocurrency exchange or stock market. Think of it as registering where the framework will pull its historical price data from. You provide a configuration object that defines how the framework should interact with that exchange, including how to fetch past price movements (candles) and format the displayed prices and trade quantities. It also handles calculating a common indicator, VWAP, based on recent trade data.
