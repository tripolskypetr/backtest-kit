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

This function helps you make sure everything is set up correctly before you run any backtests or optimizations. It checks if all the different components you're using – like exchanges, strategies, and risk managers – are properly registered in the system.

You can choose to validate specific parts of your setup by providing a list of what you want to check, or you can let it validate everything.  It's designed to be fast because it remembers the results of previous validations. 

Think of it as a final check to avoid errors later on, ensuring all your entities are in place and ready to go. It's a great habit to run this before starting a backtest!


## Function trailingTake

This function helps you manage your take-profit levels when using a trailing stop strategy. It lets you adjust the distance of your take-profit order as the price moves, but with an important rule: it always calculates the change relative to the *original* take-profit distance you set initially. 

Think of it as fine-tuning your take-profit – you provide a percentage shift, and the function calculates the new take-profit level. To avoid small errors building up over time, it consistently uses the starting point. 

If you want to make your take-profit more conservative (closer to your entry price), use a negative percentage shift. If you want it more aggressive (further from your entry price), use a positive shift. The function also intelligently prevents you from unintentionally loosening your take profit; it only moves it closer to your entry if the new calculation is more conservative than the existing one. It also automatically adapts to whether you're backtesting or trading live.

You'll need to provide the symbol of the trading pair, the percentage shift you want to apply, and the current market price.

## Function trailingStop

This function helps you manage trailing stop-loss orders for your trading signals. It lets you adjust how far away your stop-loss is from your entry price, expressed as a percentage of the original stop-loss distance you set. 

It’s really important to understand that this function works based on the *original* stop-loss you defined, not any adjustments that have already been made. This prevents errors from adding up over time.

If you want to tighten your stop-loss, use a negative percentage shift; to loosen it, use a positive percentage shift. The function is designed to always improve your protection – if a new stop-loss distance isn't better, it won't be applied. 

For long positions, it will only allow you to move your stop-loss higher, and for short positions, only lower, always prioritizing the position that gets you closer to your entry point. This function also automatically adapts to whether you're running a backtest or live trading.

You provide the symbol of the trading pair, the percentage shift you want to apply, and the current market price to evaluate.

## Function stop

This function lets you pause a trading strategy, effectively stopping it from creating any new trades. Think of it as hitting the emergency brake. It won't immediately close any existing trades; those will finish normally. The system will then halt at a convenient point, either when it’s idle or once the current trade is completed, regardless of whether it's a backtest or a live trading session. You simply provide the symbol of the trading pair you want to pause.

## Function setLogger

This function lets you plug in your own logging system to backtest-kit. It's useful if you want to send log messages to a specific place, like a file, a database, or a monitoring service. When you provide a logger, the framework will automatically add helpful details to each log message, like the strategy's name, the exchange used, and the trading symbol. This makes it easier to understand what's happening during your backtests. Essentially, you're customizing how the framework reports its internal activity.


## Function setConfig

This function lets you adjust how the backtest-kit framework operates. Think of it as fine-tuning the engine behind your trading simulations. You can modify specific settings to tailor the framework to your needs, providing a partial configuration object to override the defaults. There’s also an "unsafe" flag that allows you to bypass certain checks – primarily intended for use within testing environments.

## Function setColumns

This function lets you customize the columns that appear in your backtest reports, like the ones generated for markdown. You can change how different data points are displayed, essentially tailoring the report to show exactly what you need. It’s like adjusting the layout of a spreadsheet – you’re modifying the structure of the report itself.  You can partially update the column configurations; you don't have to redefine everything.  There's a special `_unsafe` option primarily used in testing environments where you might need to bypass some of the checks for column validity.

## Function partialProfit

This function lets you automatically close a portion of an open trade when it's in profit, moving towards your take profit target. You specify the trading symbol and the percentage of the position you want to close – for example, closing 25% of your trade. It intelligently figures out if you’re running a backtest or a live trade, so you don’t have to worry about that. This can be a useful way to lock in profits as a trade progresses.

## Function partialLoss

This function lets you automatically close a portion of an open trade when the price is heading towards your stop-loss level. It's designed to help manage risk by taking some profits or reducing losses as the market moves against you. You specify the trading symbol and the percentage of your position you want to close, and the framework handles the rest, determining whether it's running in a backtesting environment or a live trading setting. This feature can be useful for strategies that benefit from incrementally adjusting exposure based on market direction.

## Function listWalkers

This function lets you see all the different "walkers" that are currently set up in your backtest-kit system. Think of walkers as reusable components for analyzing your trading strategies.  It returns a list containing information about each walker, like their configuration details. This is particularly helpful if you're trying to understand how your system is built or want to create tools that automatically manage these walkers. Basically, it gives you a peek behind the scenes at the registered walkers.

## Function listStrategies

This function lets you see a complete catalog of all the trading strategies your backtest-kit setup knows about. It gathers information about each strategy, like its configuration and how it’s structured. Think of it as a way to inspect what strategies are available for use, useful if you're trying to understand your system or create tools that automatically manage strategies. The result is a list you can easily work with in your code.


## Function listSizings

This function lets you see all the different ways your backtest kit is configured to handle order sizes. It essentially gives you a list of all the sizing strategies you've set up. Think of it as a way to check what's going on under the hood and make sure your sizing rules are as you expect them to be. You can use this to create tools that show your sizing rules or to help you troubleshoot any issues related to order sizing.

## Function listRisks

This function helps you see all the risk assessments your backtest kit is set up to handle. It fetches a list of all the risk configurations you’ve added, giving you a clear picture of what your system is monitoring. Think of it as a way to inspect your risk management setup—great for troubleshooting or generating documentation. You’ll get an array containing information about each registered risk.

## Function listOptimizers

This function lets you see all the different optimization strategies your backtest kit is using. It returns a list describing each optimizer, which can be helpful if you're trying to understand how your system is configured, creating tools to manage optimizers, or just checking things out. Essentially, it gives you a peek under the hood to see what optimization options are available.

## Function listFrames

This function lets you see a complete overview of all the data structures, or "frames," that your backtest system is using. Think of it as a directory listing for your data – it shows you exactly what kinds of information are available for analysis. It's really helpful when you're setting things up, making sure everything is connected properly, or if you’re building tools to visualize your backtesting process. Essentially, it gives you a list of blueprints that define how your data is organized.

## Function listExchanges

This function lets you see all the different exchanges your backtest-kit setup knows about. It's like a directory listing – you'll get a list of exchange configurations that have been added. This is helpful if you're trying to understand your setup, create documentation, or build a user interface that needs to display exchange options. It returns a promise that resolves to an array of exchange schemas.


## Function listenWalkerProgress

This function lets you keep track of how a backtest is progressing, step by step. It’s perfect if you want to display progress updates or perform actions after each strategy finishes running.

You provide a function that will be called whenever a strategy completes during the backtest. Importantly, even if your function takes time to complete (like if it’s making an asynchronous call), the backtest won’t be blocked—it will continue processing events in the order they come. This ensures a smooth and reliable backtesting experience.

The function returns another function that you can use to unsubscribe from these progress updates when you no longer need them.


## Function listenWalkerOnce

This function lets you set up a listener that reacts to changes happening within a trading system, but only once. You tell it what kind of change you're interested in with a filter – think of it as a specific condition you're waiting for. When that condition is met, it runs a function you provide, and then it automatically stops listening, so you don’t have to manage the subscription yourself. It’s perfect for situations where you need to respond to a particular event and then move on.

Essentially, you provide a rule (`filterFn`) to identify the event you want, and a task (`fn`) to perform when that event occurs. The listener then takes care of everything else, automatically subscribing and unsubscribing.


## Function listenWalkerComplete

This function lets you be notified when a backtest run finishes. It’s like setting up a listener that gets triggered when all the strategies have been tested. The important thing is that even if your notification code takes some time to run, the notifications will be handled one after another, ensuring things happen in the right order. This prevents any potential conflicts or issues from callbacks running at the same time. You provide a function that will be called with details about the completed backtest when the run is done.

## Function listenWalker

This function lets you keep track of how a backtest is progressing. It essentially subscribes you to updates that happen after each strategy finishes running within a backtest. The updates, or "events," are delivered one at a time, even if your callback function takes some time to process them – this ensures things don't get jumbled up. Think of it as a way to get notified about each strategy's completion in a controlled and orderly manner. To stop listening for these updates, the function returns another function you can call.

## Function listenValidation

This function lets you keep an eye on potential problems during risk validation. It's like setting up an alert system—whenever a validation check fails and throws an error, this function will notify you. The errors are handled one at a time, in the order they happen, even if your notification process takes some time. You provide a function that gets called with the error details, giving you a way to log, report, or otherwise respond to validation failures. It’s a simple way to catch and debug issues as they arise in your trading strategy's risk management.


## Function listenSignalOnce

This function lets you listen for specific trading signals and react to them just once. You tell it what kind of signal you're looking for using a filter – a test that checks each incoming signal. Once a signal matches your filter, the provided callback function runs, and then the listener automatically stops itself. It's perfect for situations where you need to wait for a particular condition to be met before taking action. Essentially, it's a way to temporarily subscribe to signals, get notified when something specific happens, and then automatically unsubscribe.


## Function listenSignalLiveOnce

This function lets you temporarily tap into live trading signals, but only to receive one specific event. You provide a filter – a way to describe exactly which signal you're interested in – and a function that will run *once* when that signal arrives. After that single execution, the subscription is automatically cancelled, preventing further unwanted notifications. It's helpful for actions like quickly grabbing a specific data point during a live run without needing to maintain a long-term subscription.


## Function listenSignalLive

This function lets you tap into the live trading signals generated by backtest-kit. Think of it as setting up a listener that gets notified whenever a signal is produced during a live run. The signals are delivered one by one, ensuring they are handled in the order they arrive. You provide a function that will be called with each signal event, allowing you to react to those signals in real time. This is useful if you need to process signals as they come in, such as for debugging or real-time monitoring.


## Function listenSignalBacktestOnce

This function lets you react to specific signals generated during a backtest, but only once. You provide a filter—a rule that defines which signals you're interested in—and a function to execute when a matching signal arrives. The function automatically stops listening after it has run once, ensuring you don’t get bombarded with unnecessary notifications. It’s handy for things like logging a single, important event or performing a one-time calculation based on a signal. 

Here's how it works:

*   **`filterFn`**: This is your gatekeeper. It examines each signal from the backtest and decides whether or not the attached function should be called.
*   **`fn`**:  This is the action you want to perform. It will be executed only once when a signal passes through your filter. 


## Function listenSignalBacktest

This function lets you tap into the stream of data generated during a backtest run. Think of it as subscribing to updates about what's happening as the backtest progresses. It provides a way to react to each 'tick'—a moment in time during the backtest—by providing a function that gets called with information about that tick.  Importantly, these updates are handled one at a time, ensuring events are processed in the order they occur.  The subscription is temporary; the function returns another function you can call to unsubscribe and stop receiving updates.

## Function listenSignal

This function lets you tap into the trading signals generated by backtest-kit. You provide a function that will be called whenever a trading event happens – like when a strategy goes idle, opens a position, becomes active, or closes a trade. Importantly, your function will be executed one at a time, even if it involves asynchronous operations, ensuring that signals are processed in the order they occur. Think of it as setting up a listener to be notified about all the key happenings in your trading strategy.


## Function listenRiskOnce

This function lets you react to specific risk rejection events just once. You provide a filter—a test that determines which events you're interested in—and a callback function that will execute when a matching event occurs. After the callback runs once, the listener automatically stops, making it perfect for situations where you only need to respond to a condition a single time. Essentially, it's a temporary listener for risk events. 

It's designed to be simple to use: define your filter, write your callback, and let `listenRiskOnce` handle the subscription and unsubscription automatically.


## Function listenRisk

This function lets you be notified when a trading signal is blocked because it violates your risk rules. Think of it as a safety net – you'll only receive alerts when something goes wrong and a trade is rejected. The system makes sure these alerts are handled one at a time, even if your notification process takes some time, and it only sends notifications when a signal is actually rejected, keeping things clean and preventing unnecessary messages. You provide a function that will be called with details about the rejected signal whenever this happens.

## Function listenPingOnce

This function lets you react to specific ping events, but only once. You provide a filter that determines which pings you're interested in, and then a function that will be executed when a matching ping arrives. After that function runs once, the subscription automatically stops, so you don't have to worry about cleaning things up. It’s a convenient way to wait for a particular condition to be met within the ping stream and then take action.

You define the filter using a function that checks each ping event; if it matches, your provided callback will be triggered.


## Function listenPing

This function lets you keep an eye on the status of your trading signals as they're waiting to be activated. Think of it as getting little check-in messages every minute to confirm things are running smoothly. You provide a function that gets called with each of these “ping” events, letting you build custom checks or track how long a signal has been waiting. It's a way to make sure everything is working as expected while you’re waiting for your trading strategies to kick in. When you're done monitoring, you can unsubscribe with the function that’s returned.

## Function listenPerformance

This function lets you keep an eye on how quickly your trading strategies are running. It's like attaching a performance monitor that tells you how long different parts of your code take to execute. Whenever a significant action happens during trading, this monitor sends you a notification containing timing information. These notifications are handled one at a time, ensuring a smooth and reliable way to analyze your strategy's speed and spot any areas that might be slowing it down. You provide a function that will receive these performance updates, and the function itself returns another function to unsubscribe from these updates when you’re done.

## Function listenPartialProfitOnce

This function lets you react to specific partial profit events in your backtest, but only once. You provide a filter – a rule that defines which events you’re interested in – and a function to execute when a matching event occurs. After the function runs once, the listener automatically stops, ensuring it doesn’t trigger repeatedly for the same condition.

Think of it as setting a temporary alert: you want to know when something specific happens, but you don't need to keep listening after that. 

It’s handy when you need to take action based on a particular profit milestone and then move on.


## Function listenPartialProfit

This function lets you be notified whenever your trading strategy hits certain profit milestones, like 10%, 20%, or 30% gains. It’s designed to ensure these notifications are handled one at a time, even if your notification process takes some time to complete. You provide a function that gets executed whenever a profit milestone is reached, and this function receives data about the event. Think of it as setting up a listener that keeps you informed about your progress toward profitability.

## Function listenPartialLossOnce

This function allows you to react to specific partial loss events in your backtest. You provide a filter – a way to describe the exact loss conditions you’re interested in – and a function to execute when that condition is met.  Critically, it’s a "one-time" listener; it will trigger your function just once and then automatically stop listening, simplifying your code and preventing unwanted repeated actions. It's perfect for situations where you need to respond to a particular loss occurrence and then move on.

## Function listenPartialLoss

This function lets you keep track of when your trading strategy hits certain loss levels, like losing 10%, 20%, or 30% of its value. It's designed to ensure these updates happen one at a time, even if your code takes some time to process each event.  You provide a function that will be called whenever a loss level milestone is reached, and this function will handle the details of what to do when that happens. The function you provide will receive information about the partial loss event. It also returns a function that you can use to unsubscribe from these loss level updates later on.

## Function listenOptimizerProgress

This function lets you keep an eye on how your backtest optimization is going. It provides updates as the optimizer works through the data, ensuring you see the progress step-by-step. The updates are sent in the order they happen, and even if your callback function needs to do some extra processing, it will be handled safely without causing any issues. Think of it as a way to get notified about what's happening behind the scenes during your optimization runs. You give it a function to run when progress is made, and it will call that function with information about the progress. When you’re done listening, you can unsubscribe using the function it returns.

## Function listenExit

This function lets you be notified when a critical error occurs that will stop the backtest or live trading process. Think of it as an emergency alert for your trading system – it signals a problem that can’t be easily recovered from. It's different from handling regular errors; this one means the entire background process is shutting down. The error information will be passed to your provided function, and the execution order of your handling function is guaranteed to be sequential, even if that function does some asynchronous work.

## Function listenError

This function lets you set up a system to catch and deal with errors that happen while your trading strategy is running, but aren't serious enough to stop everything completely. Think of it as a safety net for things like temporary API connection problems.

It ensures that when an error occurs, a specific function you provide is called to handle it. 

Importantly, these error handling actions are processed one at a time, in the order they happen, even if the function you provide needs to do some asynchronous work. This helps to avoid unexpected issues arising from trying to handle errors all at once.

The function returns a way to unsubscribe from these error notifications when you're finished with them.

## Function listenDoneWalkerOnce

This function lets you react to when background tasks within your backtest finish, but only once. You provide a filter to specify which completed tasks you’re interested in, and a function to run when a matching task is done. The function takes care of automatically stopping the subscription after it's executed your callback, so you don't have to worry about managing that yourself. Think of it as setting up a listener that fires just one time for a specific event.

It's helpful for actions you only want to perform once a particular background process concludes.


## Function listenDoneWalker

This function lets you listen for when background tasks within a Walker finish running. It's useful for tracking the progress of longer processes you’ve started in the background.

When a background task is done, it will call the function you provide. Importantly, these completion notifications are handled one at a time, even if the function you provide takes some time to execute – this ensures things don't get out of order or run into unexpected issues.  You’ll receive a `DoneContract` object with details about the completed task.  The function returns another function which you can call to unsubscribe from these completion events.

## Function listenDoneLiveOnce

This function lets you keep an eye on when background tasks within your backtest finish, but in a clean, one-time kind of way. You provide a filter – a condition that determines which completed tasks you're interested in – and a function to run when a matching task is done.  It's designed to be simple: it executes your provided function just once when a matching event occurs and then automatically stops listening. Think of it as a quick way to react to specific background job completions without cluttering up your code with ongoing subscriptions.


## Function listenDoneLive

This function lets you monitor when background tasks within your backtest finish running. It's particularly useful if you’re doing something with the results after those tasks complete.  The function provides a way to be notified when a background process is done, ensuring that events are handled one at a time, even if your handling logic takes some time to execute. Think of it as a reliable way to keep track of ongoing background operations and react to their completion in a controlled manner. You provide a function to execute when a task is finished, and the function returns another function to unsubscribe from these events when you no longer need them.

## Function listenDoneBacktestOnce

This function lets you react to when a backtest finishes running in the background, but only once. You provide a filter to specify which completed backtests you're interested in, and then a function that will be executed when a matching backtest finishes. After the function runs once, it automatically stops listening, so you don't need to worry about cleaning up the subscription yourself. Essentially, it’s a way to get notified of a single backtest completion and then be done with it.


## Function listenDoneBacktest

This function lets you be notified when a backtest finishes running in the background. It’s perfect for actions you need to take after a backtest completes, like saving results or updating a display. Importantly, the notifications happen one at a time, even if the function you provide takes some time to run – this ensures things don’t get out of order or overwhelm the system. You give it a function to execute when a backtest is done, and it returns another function that you can use to stop listening for these completion signals later on.

## Function listenBreakevenOnce

This function lets you watch for specific breakeven protection events and react to them just once. You provide a filter – a test to see if an event is interesting – and a function to run when a matching event happens.  Once the function runs, it automatically stops listening, so you don't have to worry about cleaning up the subscription. It's handy when you only need to respond to a breakeven condition one time. 

The `filterFn` decides which events you care about, and the `fn` is what actually gets executed when a matching event is found.

## Function listenBreakeven

This function lets you keep an eye on when your trades reach a breakeven point – that’s when the price moves enough to cover all your initial costs and essentially get you back to zero. You provide a function that will be called whenever this happens, and it will handle these breakeven events one at a time to avoid any conflicts. Think of it as a notification system for when your losses are protected, ensuring a smooth and orderly response. The callback function receives information about the specific trade that hit breakeven.

## Function listenBacktestProgress

This function lets you keep an eye on how your backtest is running. It allows you to provide a callback function that will be notified whenever the backtest makes progress.

Importantly, these progress updates are handled in order, even if your callback function takes some time to complete – this ensures everything stays synchronized. The system handles queuing these updates to avoid any issues with running multiple callbacks at the same time. You’ll get a `ProgressBacktestContract` object with each update, containing details about the progress.  When you're done listening, the function returns another function you can call to unsubscribe.

## Function hasTradeContext

This function simply tells you if the system is currently ready for trading actions. It verifies that both the execution and method contexts are active. Think of it as a quick check to see if you're in a state where you can safely use functions that interact with the exchange, like fetching candle data or formatting prices. It returns `true` only when everything is properly set up and ready to go.

## Function getOrderBook

This function allows you to retrieve the order book for a specific trading pair, like BTCUSDT. Think of it as getting a snapshot of what buyers and sellers are currently offering. 

You can specify how many levels of the order book you want to see; if you don't, it will default to a reasonable maximum depth. The function automatically considers the timing context, meaning it adapts whether it's being used for backtesting (historical analysis) or live trading. The actual exchange connection will interpret the timing information accordingly.

## Function getMode

This function tells you whether the backtest-kit is currently running in backtest mode or live trading mode. It returns a promise that resolves to either "backtest" or "live", letting your code adapt its behavior depending on the environment it's operating in. Think of it as a simple way to check if you're testing historical data or actively trading.

## Function getDefaultConfig

This function gives you a starting point for setting up your backtesting environment. It provides a set of pre-configured values that control various aspects of the framework, like how often it checks for new signals, how it handles slippage and fees, and limits on signal lifetimes. Think of it as a template—you can use these defaults as they are, or customize them to fine-tune your backtest. It's a good way to understand all the different settings you *can* adjust to influence your results.

## Function getDefaultColumns

This function provides a handy way to see the standard column setup used for generating reports within the backtest-kit framework. It gives you a look at the pre-configured columns for various data types like strategy results, heatmaps, live ticks, and more. Think of it as a blueprint; you can examine the default definitions to understand what’s possible and potentially customize them for your specific reporting needs. It's a useful resource for learning about the available column options and their initial settings.

## Function getDate

This function simply retrieves the current date. 

Think of it as a way to know what date your code is working with. 

During backtesting, it tells you the date associated with the particular historical timeframe you're analyzing. 

When running live, it provides the current, real-time date.

## Function getConfig

This function lets you peek at the global settings that backtest-kit uses. Think of it as a way to see what the framework is configured to do, like how often it checks prices or how much slippage it expects. Importantly, it gives you a copy of these settings, so you can look at them without risking changing the actual, running configuration. It's a safe way to understand the framework's current behavior.

## Function getColumns

This function provides a snapshot of how your backtest kit reports are structured. It gathers information about all the different columns used in various reports, like those for closed trades, heatmaps, live data, partial fills, breakeven points, performance metrics, risk events, scheduling, walker signals, and strategy results. 

Think of it as getting a read-only view of the columns that will appear in your reports – you can see what’s there, but you can't change it directly. This is really helpful if you want to understand how your data is being organized or to adapt your reporting logic without accidentally affecting the core configuration.

## Function getCandles

This function helps you retrieve historical price data, like opening, closing, high, and low prices, for a specific trading pair. You tell it which trading pair you're interested in (for example, "BTCUSDT"), how frequently the data should be grouped (like every minute, every hour, etc.), and how many data points you want to retrieve. It then goes to the exchange you're connected to and pulls that historical data for you. Think of it as requesting a snapshot of past price activity.


## Function getAveragePrice

This function helps you figure out the average price a security has traded at, specifically using a technique called Volume Weighted Average Price or VWAP. It looks at the last five minutes of trading data for a given symbol, like BTCUSDT, and considers both the price and the volume of each trade.  The calculation uses the high, low, and closing prices of each minute to determine a "typical" price, then combines that with the volume to get the VWAP. If there's no trading volume recorded, it simply averages the closing prices instead. You provide the symbol you want to analyze as input.

## Function formatQuantity

This function helps you prepare the right quantity of assets when placing orders. It takes a trading symbol, like "BTCUSDT," and a raw quantity number, and then formats it to match the specific rules of the exchange you're using. This ensures that your orders are valid and prevents errors caused by incorrect decimal places. Essentially, it handles the complexities of different exchange formatting requirements for you.

## Function formatPrice

This function helps you display prices in a way that matches how a specific exchange shows them. It takes a trading pair symbol, like "BTCUSDT," and the actual price number as input. Then, it uses the exchange's own rules to format the price correctly, ensuring the right number of decimal places are shown. This is useful for presenting price data in a consistent and user-friendly way.

## Function dumpSignal

This function helps you save detailed records of your AI trading strategy's decisions. It takes the conversation history with the AI, the resulting trading signal, and creates a well-organized set of markdown files. These files contain the system prompts, each user message, and the final AI output along with the trading signal details.  Think of it as a way to create debug logs, making it easier to understand and improve your AI's performance. The function smartly avoids overwriting any existing log files, preserving previous analysis. You specify a unique identifier for each run, and optionally choose where to store these log files.

## Function cancel

This function lets you cancel a pending signal that your strategy generated, without interrupting the strategy itself or any existing orders. Think of it as hitting a pause button on a specific signal. You can optionally provide a unique ID to help you track which cancellation request you made. It works whether you're backtesting or running live, automatically adjusting to the environment. Canceling a signal doesn't stop your strategy from creating new ones, and it doesn’t trigger any stop actions.

## Function breakeven

This function helps you manage your risk during a trade. It automatically adjusts your stop-loss order to the entry price—essentially, a breakeven point—once the price moves favorably enough to cover the costs associated with the trade, like slippage and fees. 

It calculates this threshold based on a combination of slippage and fee percentages. You don't need to worry about whether you're in a backtest or live trading environment, as it adapts automatically. The function also gets the current price for you, simplifying the process. To use it, you just need to provide the trading pair's symbol.

## Function addWalker

This function lets you register a "walker" which is a powerful way to run and compare different trading strategies against each other using the same historical data. Think of it as setting up a standardized testing environment for your strategies. You provide a configuration object, the `walkerSchema`, which tells the framework how to execute and evaluate the backtests. This is key for rigorous performance analysis and identifying which strategies truly shine.

## Function addStrategy

This function lets you tell backtest-kit about a new trading strategy you've built. Think of it as registering your strategy with the system so it can be used for backtesting or live trading. When you add a strategy, the framework automatically checks it to make sure the signals it produces are valid – things like prices and stop-loss orders make sense – and that signals aren't being sent too quickly.  If you're running in live mode, it also ensures that the strategy’s data is safely stored in case something goes wrong. You provide a configuration object, called `strategySchema`, which defines how your strategy works.

## Function addSizing

This function lets you tell the backtest kit how to determine the size of your trades. Think of it as setting up the rules for how much capital you'll commit to each trade based on your strategy. You provide a configuration object that outlines things like the sizing method you're using (fixed percentage, Kelly Criterion, or ATR-based), the specific risk parameters you want to use, and any limits you want to place on the size of your positions. Essentially, it’s where you define the core logic for position sizing within your trading strategy.

## Function addRisk

This function lets you tell backtest-kit about your risk management rules. Think of it as setting up guardrails for your trading strategies. You define things like the maximum number of trades you can have open at once, and even create your own custom checks to ensure your portfolio is behaving as expected, perhaps considering correlations between assets. These rules are shared across all your strategies, giving you a broad view of your overall risk exposure and allowing for smarter signal decisions. 


## Function addOptimizer

This function lets you add a custom optimizer to the backtest-kit framework. Think of an optimizer as a system that automatically creates and refines trading strategies. It pulls data from various sources, crafts prompts for a language model, and uses those prompts to build complete backtest scripts – essentially, ready-to-run trading simulations.  The schema you provide defines how this optimizer operates, including where it gets data and how it generates strategy code. It’s how you can tailor the backtest-kit to your specific strategy creation needs.

## Function addFrame

This function lets you tell backtest-kit about a specific timeframe you want to use for your backtesting. Think of it as defining a schedule for how your data will be organized – for instance, daily, weekly, or monthly. You provide a configuration object that outlines the start and end dates for your backtest, the interval (like 1 day, 1 week), and a way to handle events during the timeframe generation process. Essentially, it’s how you set the stage for the backtesting engine to work with your data in a structured, time-based manner. It’s a core part of setting up your backtest environment.

## Function addExchange

This function lets you tell backtest-kit about a new data source for trading, like Coinbase or Binance. Think of it as registering a connection to a specific exchange so the framework knows where to pull historical price data and how to format it.  You provide a configuration object – the `exchangeSchema` – that details the exchange's specific characteristics and how to access its data.  This registration enables the system to retrieve historical candles, handle price and quantity formatting appropriately for that exchange, and even calculate VWAP (Volume Weighted Average Price) based on recent trading activity.
