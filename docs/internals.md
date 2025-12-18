---
title: docs/internals
group: docs
---

# backtest-kit api reference

![schema](../assets/uml.svg)

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

## Function setLogger

You can now control where backtest-kit sends its log messages by providing your own logger. This lets you integrate the framework's logging with your existing systems, like a file, a database, or a centralized logging service. The framework will automatically add useful context to each log message, such as the trading strategy name, the exchange being used, and the symbol being traded. Just provide an object that implements the `ILogger` interface, and the framework will take care of the rest.

## Function setConfig

This function lets you adjust how backtest-kit operates, allowing you to customize settings beyond the defaults. Think of it as fine-tuning the engine of your trading simulations. You provide a new set of configuration values, and only the ones you specify will be changed; the rest will remain as they originally were. There's a special "unsafe" flag you might use in testing environments to bypass some of the configuration checks, but be careful when using it.

## Function setColumns

This function lets you customize the columns displayed in your backtest reports. You can change how information like price, volume, or trade details is presented. It's useful if you want to tailor the reports to your specific analysis needs.  You provide a partial configuration object to override the default settings, but the framework will usually check your configuration to make sure it’s valid.  If you're working in a testbed environment and absolutely need to bypass these validations (at your own risk), you can use the `_unsafe` flag.

## Function listWalkers

This function lets you see a complete inventory of all the trading strategies (walkers) currently set up within your backtest. Think of it as a way to check what's running behind the scenes. It gives you a list containing details about each strategy, which can be helpful for troubleshooting, creating documentation, or even building tools that adapt to the strategies you're using. It’s like looking under the hood to understand the full picture of your trading environment.

## Function listStrategies

This function gives you a way to see all the trading strategies that backtest-kit knows about. It essentially provides a list of descriptions for each strategy, outlining things like what data it needs and how it works. Think of it as a quick inventory of your available strategies, perfect for understanding what's available or building tools to manage them. It's a simple way to get a clear picture of your trading strategy setup.

## Function listSizings

This function lets you see all the sizing rules that are currently active within the backtest-kit system. Think of it as a way to peek under the hood and understand how your positions are being sized for each trade.  It gives you a list of all the sizing configurations, which is handy if you're troubleshooting, want to generate documentation, or need to create a user interface that adapts to those configurations. The result is a promise that resolves to an array of sizing schema objects.

## Function listRisks

This function gives you a peek into all the risk assessments your backtest-kit setup is using. It’s like getting a complete inventory of how your strategies are being protected. The function returns a list of risk configurations, which can be helpful for understanding how your system is designed, troubleshooting potential issues, or even creating tools to visualize these settings. Essentially, it’s a way to see all the risk checks that are currently active within your backtesting environment.

## Function listOptimizers

This function helps you discover what optimization strategies are available within your backtest-kit setup. It returns a list of descriptions for each optimizer that has been registered. Think of it as a way to see what options you have for fine-tuning your trading strategies – it's handy for checking your configuration or creating tools that automatically display optimization choices. You can use this list to understand what's possible and troubleshoot any issues related to your optimizers.

## Function listFrames

This function helps you see all the different data "frames" your backtest kit is using. Think of frames as organized sets of data, like historical prices or trading signals. It returns a list of descriptions for each of these frames, letting you understand what data is available and how it's structured. This is handy when you're trying to understand your setup, create documentation, or build tools that need to know about the data frames.

## Function listExchanges

This function lets you see a complete list of all the exchanges your backtest-kit environment is set up to use. Think of it as a way to check which data sources are available for your trading simulations. It’s particularly helpful when you're troubleshooting, building interfaces that need to know which exchanges are present, or just generally understanding your setup. The function returns a promise that resolves to an array, where each item in the array describes an exchange.

## Function listenWalkerProgress

This function lets you track the progress of a backtest as it runs. It calls a function you provide after each trading strategy finishes within the backtest. Importantly, even if your tracking function takes some time to execute, the backtest will continue smoothly and events will be processed one at a time to keep things organized. Think of it as getting updates as each strategy completes, ensuring everything happens in the correct order. To stop listening for these progress updates, the function returns another function that you can call.

## Function listenWalkerOnce

This function lets you temporarily watch for specific events happening within a trading simulation. Think of it as setting up a quick alert – you define what kind of event you’re interested in, and a function will run once when that event occurs. Once the function runs, the alert automatically disappears, so you don't have to worry about cleaning up afterward. It’s perfect for situations where you only need to react to a particular condition briefly during a backtest. 

You tell it what to look for with `filterFn` – essentially, the criteria for the event you want to catch. Then you provide the `fn`, which is the code you want to run when a matching event is found.

## Function listenWalkerComplete

This function lets you be notified when a backtest run finishes, ensuring that all strategies have been tested. It's particularly useful when you need to perform actions after the backtest completes, like saving results or triggering another process. The function gives you a callback that gets executed when the backtest is done, and importantly, it handles asynchronous operations in a safe and orderly way, preventing issues from overlapping tasks. You provide a function that will be called with information about the completed backtest, and it returns a function to unsubscribe from these notifications later.


## Function listenWalker

The `listenWalker` function lets you track the progress of a backtest. It’s like setting up a notification system that tells you when each trading strategy finishes running within the backtest.  

You provide a function (`fn`) that will be called after each strategy completes. Importantly, these notifications are handled one at a time, ensuring that your code doesn’t try to process them simultaneously, even if your notification function itself takes some time to complete.  This allows you to easily monitor and potentially react to the results of each strategy as they become available during the backtest process. The function returns an unsubscribe function that you can use to stop listening.

## Function listenValidation

This function lets you keep an eye on potential problems during risk validation. It's like setting up an alert that notifies you whenever a validation check fails and throws an error.  You provide a function that will be called whenever such an error occurs, allowing you to debug or log these failures. Importantly, these errors are handled one at a time, ensuring a controlled and sequential process, even if your error handling function takes some time to complete. This helps maintain stability and makes it easier to understand what's going wrong.


## Function listenSignalOnce

This function lets you subscribe to signals from your trading strategy, but with a twist: it only listens once. You provide a filter that defines which signals you're interested in, and a callback function that will run when a matching signal arrives. Once the callback executes, the subscription automatically ends, making it perfect for situations where you need to react to a specific signal just once and then move on. It’s like setting up a temporary listener for a unique opportunity.


## Function listenSignalLiveOnce

This function lets you temporarily tap into live trading signals, but only to receive one specific event. Think of it as setting up a short-lived listener. You provide a filter – a rule to determine which signals you’re interested in – and a function to run when a matching signal arrives. Once that single event is processed, the listener automatically disappears, preventing further unwanted notifications. It’s particularly useful for debugging or reacting to a unique circumstance during a live trading run.


## Function listenSignalLive

This function lets you tap into the live trading signals generated by backtest-kit. It's designed for receiving updates as your strategies execute in real-time.  Think of it as setting up a listener that gets notified whenever a trading signal is produced during a live run.

The listener function you provide will receive events as `IStrategyTickResult` objects, and these events are guaranteed to arrive in the order they were generated.  Importantly, it only works with signals produced by `Live.run()`. This setup ensures that any processing you do with these signals happens one at a time, preventing potential issues with asynchronous operations.  When you're finished listening, the function returns another function you can call to unsubscribe.


## Function listenSignalBacktestOnce

This function lets you tap into the stream of signals generated during a backtest, but with a twist – it's a one-time deal.  You provide a filter to specify which signals you're interested in, and a callback function that will execute just once when a matching signal arrives.  Think of it as setting up a temporary listener that automatically cleans itself up after it's done its job. It's particularly useful when you need to perform a single action based on a specific signal during a backtest run.


## Function listenSignalBacktest

This function lets you tap into the flow of a backtest and get notified about what's happening. It's designed to receive updates during a `Backtest.run()` execution. Think of it as a way to listen for signals generated during the backtesting process.  The signals arrive one by one, in the order they were created, so you can process them sequentially without worrying about things getting out of sync. You provide a function that will be called whenever a new signal is available, allowing you to react to the backtest's progress. Importantly, the function you provide will be responsible for handling the signal data.

## Function listenSignal

This function lets you easily keep track of what's happening with your trading strategy. It allows you to register a callback that will be triggered whenever your strategy produces a signal – whether it’s deciding to do nothing (idle), opening a position, actively holding one, or closing a position. 

The cool thing is, it handles events one at a time, even if your callback function takes some time to complete. This ensures that signals are processed in the order they arrive, avoiding potential conflicts or issues that might arise from things happening simultaneously. Think of it as a neat, orderly way to react to your strategy's decisions. You provide a function, and it takes care of calling it with the relevant signal information. When you no longer need to listen, the function will return a way to unsubscribe.

## Function listenRiskOnce

This function allows you to react to specific risk rejection events, but only once. You provide a filter that determines which events you’re interested in, and a function that will be executed when a matching event occurs. Once the function runs, it automatically stops listening, making it perfect for scenarios where you need to react to something just once and then move on. Think of it as setting up a temporary alert that fires just when a specific condition is met.

## Function listenRisk

This function lets you tap into events that happen when a trade signal is blocked because it violates your risk rules. Think of it as a notification system specifically for when things go wrong with your risk management. Importantly, you only receive these notifications when a signal *isn’t* allowed – you won't be flooded with updates for every trade that passes your checks.

The notifications are handled one at a time, even if your callback function takes some time to process, ensuring a smooth and orderly flow of information.  It's designed to prevent your callback from running too many things at once, which could cause problems.

You provide a function (`fn`) as input; this function will be called whenever a risk rejection event occurs, giving you the details about why the signal was rejected. The function you provide will also return another function which you must call to unsubscribe from these risk rejection events.


## Function listenPerformance

This function lets you monitor how your trading strategies are performing in terms of speed and efficiency. It acts like a listener, catching events related to timing metrics as your strategy runs. Think of it as a way to pinpoint slow parts of your code – those potential bottlenecks that could be impacting your trading performance. The events are delivered in the order they happen, and the callback function you provide will always be executed one at a time, even if it involves asynchronous operations. This ensures a stable and predictable way to observe performance data. You provide a function that will be called whenever a performance event occurs, and the function returns another function that you can call later to stop listening.

## Function listenPartialProfitOnce

This function lets you react to a specific profit-taking condition happening in your backtest, but only once. You provide a rule – a filter – that defines what kind of profit event you’re looking for, and a function to execute when that event happens. Once the event matches your rule and the function runs, the listener automatically stops, so you won't be bothered by further profit events. 

It’s great for things like triggering a specific action when a certain profit level is reached and then forgetting about it.

The first argument is the rule; it checks if the profit event matches your criteria. The second is the action – the function that gets called just one time when your rule is met. The function returns a cleanup function that you can call to manually unsubscribe from the event.

## Function listenPartialProfit

This function lets you track your trading progress as you reach profit milestones, like 10%, 20%, or 30% gains. It provides a way to be notified whenever these levels are hit, ensuring that any actions you take in response happen one at a time, even if the action itself takes some time to complete. You provide a function that will be called with details about the profit level achieved, and this function returns another function that you can use to unsubscribe from these notifications later.

## Function listenPartialLossOnce

This function lets you set up a temporary listener to react to specific partial loss events. You provide a filter – a way to identify the exact loss conditions you’re interested in – and a function that will run *only once* when that condition is met. After it runs, the listener automatically shuts itself down, preventing it from triggering again. It's a handy way to react to a single, specific loss situation and then forget about it. 

You give it two things: a way to check if an event is what you’re looking for, and the code to run when you find it. This code will only run one time, and then the listening stops.


## Function listenPartialLoss

This function lets you keep track of how much your trading strategy is losing during a backtest. It will notify you when the losses reach specific milestones, like 10%, 20%, or 30% of the initial capital.  The important thing is that these notifications are handled in a controlled order, even if your notification code takes some time to run – it prevents things from getting messy and ensures events are processed one at a time. You provide a function that gets called whenever a loss milestone is hit, and this function will receive information about the loss event. When you’re finished listening, the function returns another function that you can call to unsubscribe.

## Function listenOptimizerProgress

This function lets you keep an eye on how your backtest kit optimizer is doing. It provides updates as the optimizer works through its data, showing you the progress being made. These updates are delivered in the order they happen, and even if your update function takes some time to process, it’s handled carefully to prevent any conflicts or issues. Essentially, it’s a way to get real-time feedback on your optimization runs. You provide a function that will be called whenever progress is made, and this function returns another function that can be used to stop listening to the updates.

## Function listenExit

This function lets you be notified when something truly critical goes wrong and stops the backtest-kit from running, like a fatal error in a background process. Think of it as a last resort safety net. It’s different from regular error handling because these kinds of errors are severe enough to halt the whole operation. The errors are handled one at a time, in the order they happen, even if your notification code takes some time to process. This ensures things stay predictable and prevents unexpected behavior. You simply provide a function that will be called when a fatal error occurs, allowing you to log the error or take other appropriate actions. The function you provide returns another function that can be called to unsubscribe from these exit notifications.

## Function listenError

This function lets you set up a listener that gets notified whenever your trading strategy encounters a problem it can recover from. Think of it as a safety net for minor hiccups, like a temporary issue connecting to an API. When an error occurs, the provided function will be called to handle it, allowing your strategy to keep running smoothly. Importantly, these errors are handled one at a time, in the order they happen, even if your error handling function takes some time to complete.

## Function listenDoneWalkerOnce

This function lets you react to when background tasks within your backtest finish, but in a special way – it only triggers your code *once*. You provide a filter to specify which completed tasks you’re interested in, and a function that gets executed when a matching task finishes. After that single execution, the subscription automatically stops, so you don't need to worry about manually cleaning up. Think of it as setting up a temporary listener that only fires once for the first matching event.


## Function listenDoneWalker

This function lets you keep track of when background tasks within a Walker are finished. It's like setting up a notification system to be alerted when a series of operations completes.  The function takes a callback – a piece of code you provide – that will be executed when a background task is done. Importantly, even if your callback involves asynchronous operations, the events will be processed one at a time, in the order they occur, to ensure things happen correctly. The function returns another function that you can call later to unsubscribe from these notifications.

## Function listenDoneLiveOnce

This function lets you react to when a background task finishes running, but only once. You provide a way to select which finished tasks you’re interested in, and then a function to execute when a matching task completes.  After that single execution, the subscription is automatically removed, so you don’t need to worry about cleaning up. Think of it as a way to quickly get notified about a specific background task finishing its work and then being done with it.


## Function listenDoneLive

This function lets you be notified when background tasks running within the backtest-kit framework finish. It's like setting up a listener to hear when something is done. Importantly, the notifications are handled in the order they occur and any processing you do in response will be done one step at a time, preventing any potential conflicts.  You provide a function that will be called with information about the completed task, and the function returns another function which you can use to unsubscribe from these notifications later.

## Function listenDoneBacktestOnce

This function lets you react when a background backtest finishes, but only once. You provide a filter – a way to specify which backtest completions you’re interested in – and a function to run when a matching backtest is done.  The function automatically handles unsubscribing after running your provided callback, so you don't have to worry about cleanup. Think of it as setting up a temporary listener that fires just one time for a specific backtest event. 

It’s useful when you need to perform a quick action after a particular backtest completes and then don't need to listen for any further completion signals.


## Function listenDoneBacktest

This function lets you be notified when a backtest runs finish in the background. It’s useful if you want to perform actions after a backtest is complete, like updating a UI or saving results.  The function provides a callback that will be triggered when the backtest finishes, and it makes sure these callbacks are handled one at a time, even if they involve asynchronous operations. You subscribe to the completion event by providing a function, and the function returns another function that you can call to unsubscribe from those notifications later.

## Function listenBacktestProgress

This function lets you keep an eye on how a backtest is running. It provides updates as the backtest progresses, specifically during the background processing phase.  You give it a function that will be called whenever a progress update is available. Importantly, these updates are handled one at a time, even if your callback function takes some time to complete, ensuring things don't get out of order. The function returns another function which when called, unsubscribes the listener.

## Function getMode

This function lets you check if backtest-kit is currently running a simulation (backtest mode) or a live trading session. It's a simple way to determine the environment your code is operating in, which can be useful for adjusting behavior or logging information differently depending on whether you’re testing or trading for real. The function returns a promise that resolves to either "backtest" or "live", clearly indicating the current mode.


## Function getDefaultConfig

This function provides a quick way to get a set of standard settings used by the backtest-kit framework. Think of it as a starting point for your own configurations – you can inspect the values to understand what's possible and adjust them as needed. It gives you a read-only object containing various parameters that control things like candle processing, slippage, fees, and signal generation. It’s helpful if you're new to the framework and want to explore the configuration options.

## Function getDefaultColumns

This function provides a quick way to see the standard column configurations used for generating reports within the backtest kit. It essentially gives you a look at the pre-defined columns for different report sections like backtest results, heatmaps, live data, performance metrics, and more. Think of it as a blueprint for how the columns are structured and what data they typically display – helpful if you want to understand the framework's reporting system or customize your own column layouts. The returned configuration is read-only, meaning you can’t modify it directly, but you can use it as a guide for creating your own custom column definitions.

## Function getDate

This function, `getDate`, simply tells you what the current date is within your trading environment. If you're running a backtest, it will provide the date associated with the timeframe you’re analyzing. When operating in a live trading scenario, it gives you the actual, real-time date. It's a handy way to know the date being used for calculations or decision-making.

## Function getConfig

This function lets you peek at the overall settings used by the backtest-kit framework. It gives you a snapshot of things like how often it checks for new signals, retry attempts for data fetching, and limits on signal duration. Importantly, it provides a copy of these settings, so you can look at them without risking accidentally changing the actual configuration. Think of it as a read-only view of how the backtest is currently set up.

## Function getColumns

This function provides a snapshot of the columns used for generating reports within the backtest kit. It gathers configurations for various data types, including closed trade results, heatmap rows, live ticks, partial events, performance metrics, risk events, scheduled events, walker signals, and strategy results.  The returned data is a copy, ensuring that any changes you make won't affect the framework's internal column settings.  Think of it as a way to peek at how the reports are structured and what data is being displayed.

## Function getCandles

This function allows you to retrieve historical price data, specifically candles, for a particular trading pair. You tell it which symbol you're interested in, like "BTCUSDT" for Bitcoin against USDT, and the time interval you want the data for, such as "1m" for one-minute candles.  You also specify how many candles, or data points, you need. The function then pulls this historical data from the exchange you’re connected to. The data is fetched starting from the present time and going backward.

## Function getAveragePrice

This function helps you find the Volume Weighted Average Price, or VWAP, for a specific trading pair. It looks at the recent trading activity – specifically the last five minutes of 1-minute candles – to figure out this average price.  The VWAP is calculated using the high, low, and closing prices of those candles, weighted by the volume traded at each price point. If there's no trading volume during that period, it will fall back to a simple average of the closing prices instead. You just need to provide the symbol of the trading pair, like "BTCUSDT", and it will return the calculated VWAP as a number.

## Function formatQuantity

This function helps you display the correct quantity of an asset when placing orders. It takes a trading symbol like "BTCUSDT" and a numerical quantity as input. The function then automatically adjusts the quantity's formatting to match the specific rules of the exchange you're using, ensuring it's displayed accurately with the right number of decimal places. This makes sure your orders look correct and avoid potential rejections due to improper formatting.

## Function formatPrice

This function helps you display prices correctly for different trading pairs. It takes a symbol like "BTCUSDT" and a raw price number, then formats the price according to the rules of that specific exchange. This ensures the displayed price has the right number of decimal places, as required by the exchange. Essentially, it handles the complexities of price formatting so you don't have to.

## Function dumpSignal

This function helps you save detailed logs from your AI trading strategies, making it much easier to understand and debug how they’re making decisions. It takes the conversation history with the AI, the trading signal it generated, and a unique identifier to organize everything. 

The function creates a folder with files that break down the process – you’ll see the initial system instructions, each user question, and the AI’s final response along with the trading signal data.  It’s designed to prevent accidental overwrites by skipping the dump if the folder already exists. You can specify where these log files are saved, or they'll go into a default directory within your strategy folder.


## Function addWalker

This function lets you register a "walker," which is a component that runs multiple backtests simultaneously and then compares how different trading strategies performed against each other. Think of it as a way to easily evaluate several strategies side-by-side using the same historical data. You provide a configuration object that describes how the walker should operate, and it handles the process of running the backtests and comparing the results. This allows for a more comprehensive and efficient assessment of your strategies.


## Function addStrategy

This function lets you tell backtest-kit about a new trading strategy you want to use. Think of it as registering your strategy with the system so it knows how to execute and manage it. When you add a strategy, the framework will check to make sure it's set up correctly – that the signals are valid, that it’s not sending signals too frequently, and that it can safely save its data even if something unexpected happens during live trading. You’ll need to provide a configuration object containing all the details about your strategy.

## Function addSizing

This function lets you tell the backtest-kit how to determine the size of your trades. You're essentially defining the rules for how much capital gets allocated to each position based on factors like risk tolerance and market volatility. It's how you incorporate strategies like fixed-percentage sizing, Kelly Criterion, or ATR-based sizing into your trading framework. The `sizingSchema` you provide dictates the method used, the risk parameters involved, any limitations on position sizes, and even allows for custom calculations through callbacks.

## Function addRisk

This function lets you set up how your trading strategies manage risk within the backtest-kit framework. Think of it as defining the boundaries and safety checks your strategies must follow. You can specify limits on how many trades can be active at once and even create your own custom rules to evaluate portfolio health, like checking correlations between different assets. The best part is that all your strategies share the same risk management setup, allowing for a holistic view of your overall portfolio and preventing unintended consequences. Essentially, it's your central control panel for keeping your trading safe and sound.

## Function addOptimizer

This function lets you add a custom optimizer to the backtest-kit framework. Think of an optimizer as a system that automatically creates and refines trading strategies. It gathers information from various sources, interacts with large language models to craft strategy prompts, and then generates a complete, runnable backtesting script – essentially a full trading system ready for testing. You provide a configuration object describing how your optimizer should work, and the framework takes care of registering it for use.

## Function addFrame

This function lets you tell backtest-kit about a new timeframe you want to use for your backtesting. Think of it as defining how your data will be sliced up into chunks – specifying the start and end dates for your analysis, the interval (like daily, weekly, or hourly), and how to handle events related to those timeframes. It’s how you configure the time periods your strategies will be evaluated against, essentially mapping out the timeline for your backtest. You provide a configuration object that details these timeframe properties, and backtest-kit takes care of generating the timeframes accordingly.

## Function addExchange

This function lets you tell backtest-kit about a new data source for trading – essentially, where the historical price information comes from. You provide a configuration object that outlines how to fetch historical candle data, how to format prices and quantities for trades, and how to calculate VWAP (a volume-weighted average price) based on recent price movements. By registering an exchange, the framework knows where to get the data it needs to run your trading strategies. Think of it as adding a new stock exchange or cryptocurrency platform to the system.

# backtest-kit classes

## Class WalkerValidationService

The Walker Validation Service helps you keep track of and confirm your walker configurations, which are used for things like optimizing trading strategies and tuning parameters. It's like a central control panel for ensuring your walkers are set up correctly before you start running tests.

You can register new walkers using `addWalker`, and before using a walker, it's a good idea to `validate` that it exists – this service double-checks for you. To see all the walkers you’ve registered, use `list`. The service also cleverly remembers its validation results to speed things up.

## Class WalkerUtils

WalkerUtils provides helpful tools for working with walkers, which are essentially sets of trading strategies. It simplifies the process of running and managing these walkers, automatically handling details like identifying the specific exchange and walker name.

You can think of WalkerUtils as a central place to interact with your walkers, offering convenient functions. The `run` method lets you execute a walker and receive its results step-by-step. If you just want a walker to perform actions in the background, like logging or triggering callbacks, use `background`. 

Need to pause a walker's signal generation? The `stop` method gracefully halts the strategies within a walker, ensuring ongoing signals finish before stopping completely.

For retrieving results, `getData` pulls together data from all the strategies within a walker, while `getReport` generates a nicely formatted markdown report summarizing the walker’s performance.  You can even save this report directly to a file using `dump`. Finally, `list` gives you an overview of all the walkers currently running and their status. 

WalkerUtils is designed to be easily accessible, making it a great resource for managing and analyzing your trading strategies.

## Class WalkerSchemaService

The WalkerSchemaService helps keep track of different trading strategies, or "walkers," and their configurations in a structured and organized way. It uses a special system to ensure that the information for each walker is consistent and follows a defined format.

You can add new walker configurations using `addWalker()`, and then easily find them again later by their names. If you need to make small adjustments to an existing walker's settings, you can use the `override()` function to update just the parts you need to change. There's also a built-in check (`validateShallow`) that makes sure each walker’s configuration looks right before it’s officially registered, helping prevent errors down the road. Essentially, it's a central place to manage and ensure the quality of your trading strategy definitions.

## Class WalkerMarkdownService

This service is designed to automatically create and save reports about your backtesting strategies. It listens for updates from your walkers, which are essentially your trading simulations, and keeps track of how each strategy performs. 

The service gathers data and then generates nicely formatted markdown tables that allow you to easily compare different strategies. These reports are saved as files, making it simple to review and analyze your trading results. 

You don't have to manually start the reporting process; it’s designed to work automatically as your walkers run, ensuring you have a record of their performance. You also have the option to clear out older data when it's no longer needed. The whole process is designed to be simple and reliable, so you can focus on improving your strategies.

## Class WalkerLogicPublicService

This service acts as a friendly interface for coordinating and running walker processes. It simplifies things by automatically passing important information like the strategy name, exchange, frame, and walker name along with each request. Think of it as a helper that makes sure everything needed for a walker to function correctly is readily available.

It relies on two other internal services to do its work. It provides a `run` method which takes a symbol and context information to execute walker comparisons, essentially driving the backtesting process for all strategies. It handles the details of sending requests and managing the context, so you don't have to worry about it.


## Class WalkerLogicPrivateService

This service helps you compare different trading strategies against each other. It orchestrates the process of running each strategy and keeps track of how they're performing.

Essentially, it takes a symbol, a list of strategies you want to compare, a metric to evaluate them by (like profit or Sharpe ratio), and some context information. Then, it runs each strategy one after another, providing you with updates as each completes. 

You'll get a running tally of which strategy is looking best, and at the end, a ranked list of all strategies based on your chosen metric. It does this by using another service to actually run the backtests for each strategy.

## Class WalkerCommandService

WalkerCommandService acts as a central point for accessing various walker-related functions within the system. Think of it as a helper that simplifies using the core walker logic, making it easier to manage dependencies.

It bundles together several key services, including those responsible for logic, schema management, validation, and risk assessment. 

The `run` method is particularly important; it lets you execute a comparison of a walker for a specific trading symbol. When you run this method, you provide information about the walker's name, the exchange it's using, and the frame it operates within, ensuring the correct setup for the comparison. The result of the run is an asynchronous generator, allowing you to process the comparison results step-by-step.

## Class StrategyValidationService

The StrategyValidationService helps you keep track of your trading strategies and make sure they're set up correctly. It acts like a central manager, storing information about each strategy you’re using.

You can add new strategies using `addStrategy()`, which registers them with the service.  Before you start using a strategy, you can use `validate()` to confirm that it exists and its associated risk profile is valid – this prevents errors down the line.

The service remembers the results of these validations, so it doesn't have to re-check things repeatedly, which makes things faster.  If you need to see all the strategies you’ve registered, `list()` gives you a handy overview. Think of it as a helpful assistant ensuring your strategies are ready to go.

## Class StrategySchemaService

This service helps you keep track of the blueprints for your trading strategies. Think of it as a central place to store and manage how your strategies are structured. 

It uses a special system to ensure everything is typed correctly, preventing errors down the line. 

You can add new strategy blueprints using `addStrategy()`, and then easily find them again by their name.  If you need to make small adjustments to an existing blueprint, you can use `override()` to update it. The `validateShallow()` function checks that your new blueprints have all the necessary pieces before they’re added.  Finally, `get()` lets you retrieve a specific strategy blueprint when you need it.

## Class StrategyCoreService

StrategyCoreService acts as a central hub for managing and executing trading strategies within the backtest-kit framework. It combines several other services to ensure strategies have the necessary information, like the trading symbol and time, before they run. Think of it as a coordinator that makes sure everything is set up correctly for a strategy to do its job.

It keeps track of previously validated strategies to avoid unnecessary checks, and logs those validation activities for transparency. You can use it to quickly check if a strategy has a pending signal, or to see if it’s been stopped.

The `tick` and `backtest` methods are your go-to tools for running strategies, taking in candle data and time information to simulate trading. The `stop` method provides a way to halt a strategy from producing new signals, while `clear` is useful for forcing a strategy to re-initialize.


## Class StrategyConnectionService

The `StrategyConnectionService` acts as a central hub for managing and routing requests to your trading strategies. It intelligently connects specific trading symbols to their corresponding strategy implementations, ensuring the correct strategy handles data for each symbol. To improve performance, it keeps a record of these strategy instances, avoiding unnecessary re-creation.

Before you can use a strategy, it needs to be initialized, and this service handles that process. You can then use it to run live trades with the `tick()` function, which processes incoming market data, or perform historical backtesting using the `backtest()` function, which analyzes past data to evaluate strategy performance.

Need to pause a strategy? The `stop()` function allows you to halt a strategy from generating new signals.  If you want to force a strategy to re-initialize, or release resources, you can use `clear()`. The service also provides access to information like the current pending signal and whether a strategy is stopped, providing valuable monitoring capabilities.

## Class SizingValidationService

This service helps you keep track of your position sizing strategies and makes sure they're set up correctly. Think of it as a central place to manage how you determine the size of your trades. 

You can register new sizing strategies using `addSizing`, providing a name and the details of the strategy. Before you actually use a sizing strategy, `validate` confirms it exists, preventing errors. To speed things up, the service remembers the results of validations. Finally, `list` gives you a complete overview of all the sizing strategies you've registered.

## Class SizingSchemaService

This service helps you organize and manage your sizing schemas, which are essentially blueprints for how much to trade. It uses a special system to keep track of these schemas in a way that avoids errors thanks to TypeScript. 

You add new sizing schemas using the `register` method, and you can update existing ones with `override`.  If you need to use a sizing schema in your backtesting, you simply grab it by name with `get`.  Before a sizing schema is added, it's quickly checked to make sure it has all the necessary parts using a process called "shallow validation." This ensures consistency and helps prevent problems later on.

## Class SizingGlobalService

The SizingGlobalService is a central component for determining how much to trade in each operation. Think of it as the brain behind position sizing within the backtest-kit framework. It works closely with other services – a connection service for getting size information and a validation service to ensure the sizing is correct – to perform its calculations.

You'll primarily interact with it through the `calculate` method, which takes risk parameters and some context information to figure out the appropriate position size. This service is vital for strategies to manage risk effectively.


## Class SizingConnectionService

The SizingConnectionService helps manage how position sizes are calculated within your backtesting strategies. It acts as a central point, directing sizing requests to the correct sizing method based on a name you provide. 

To improve performance, it remembers (caches) the sizing methods it's already used, so it doesn’t have to recreate them every time.

You can think of it as a dispatcher – you tell it which sizing method you want to use (like "fixed-percentage" or "kelly-criterion"), and it handles the rest. The `calculate` method is what you'll use to actually determine the position size, taking into account your risk parameters and the chosen sizing method. If a strategy doesn't have a custom sizing configuration, the sizing name will be an empty string.

## Class ScheduleUtils

ScheduleUtils helps you keep track of and understand how your scheduled trading signals are performing. It's like a central hub for monitoring and reporting on signals that are waiting to be executed. 

Think of it as a tool to see how signals are queued up, whether any are being cancelled, and how long they’re waiting. You can ask it for data about a specific trading symbol and strategy to understand its performance.

It can also create easy-to-read markdown reports that summarize the activity of scheduled signals, and even save those reports directly to a file. It’s designed to be simple to use, always available as a single, ready-to-go instance.

## Class ScheduleMarkdownService

This service helps you track and report on scheduled signals for your trading strategies. It keeps an eye on when signals are scheduled and cancelled, organizing the information separately for each strategy you're using. 

It generates easy-to-read markdown reports detailing these events, along with useful statistics like cancellation rates and average wait times. These reports are automatically saved as files in your logs directory.

The service automatically connects to the signal events, so you don’t have to worry about setting that up. You can also clear out the stored data if needed, either for a specific strategy or everything at once. 

The service uses a system to ensure each symbol and strategy pair has its own dedicated storage space, keeping things organized. You can request specific data or reports on a per-strategy or per-symbol basis, and it handles creating the necessary directories for saving reports.

## Class RiskValidationService

This service helps you keep track of and double-check your risk management setups. Think of it as a central place to register different risk profiles – essentially, sets of rules and configurations – and make sure they're all accounted for before you start trading.

It’s designed to be efficient; once a risk profile is validated, the result is saved to avoid repeating the check.  You can add new risk profiles using `addRisk`, verify that a profile exists before using it with `validate`, or get a full list of all registered profiles through `list`. This makes managing your risk configurations easier and more reliable. The service also uses a logger to help you track what’s happening.

## Class RiskUtils

The RiskUtils class helps you understand and report on risk rejections within your trading system. Think of it as a tool to analyze why trades were rejected and how frequently.

It gathers information about rejections – including the symbol, strategy, position, price, and reason – and organizes it for easy analysis.

You can use it to:

*   Get statistical summaries of risk rejections, like total counts and breakdowns by symbol or strategy.
*   Generate clear, human-readable markdown reports detailing each rejection event, including a table of data and summary statistics.
*   Save those reports to files for later review or distribution.

The class pulls its data from a system that listens for risk events and stores rejection information, making it a convenient way to monitor and understand your risk management process.

## Class RiskSchemaService

This service helps you keep track of your risk schemas, ensuring they’re all structured correctly and consistently. It uses a special registry to store these schemas in a type-safe way. 

You can add new risk profiles using the `addRisk()` function (which is actually called `register` within the service) and retrieve them later by their assigned names using `get()`.  If you need to make small adjustments to an existing schema, `override()` lets you update specific parts of it. Before a schema is officially registered, `validateShallow()` performs a quick check to make sure it has all the essential pieces in place.

## Class RiskMarkdownService

This service helps you automatically generate reports detailing risk rejections in your backtesting framework. It keeps track of when and why trades are rejected, organizing the information by the trading symbol and strategy being used. 

It listens for risk rejection events, compiles them into easy-to-read markdown tables, and provides summary statistics like total rejections and breakdowns by symbol and strategy. These reports are saved as `.md` files, making them simple to view and analyze.

The service manages storage separately for each symbol-strategy combination, ensuring that data remains organized. It also has an automatic initialization process, so you don't have to worry about setting it up manually. You can clear the accumulated data if needed, either for a specific symbol-strategy or globally.

## Class RiskGlobalService

This service manages risk-related operations, acting as a central point for validating and tracking trading signals against predefined risk limits. It works closely with a connection service to interact with the risk management system.

The service keeps a record of open trading signals, using this information to ensure trades adhere to established risk parameters. It automatically validates risk configurations to avoid unnecessary checks and keeps a log of validation activity. 

You can use it to confirm whether a signal is permissible based on risk rules, register new signals, or close existing ones with the risk management system. It also provides a way to clear all or specific risk data when needed.

## Class RiskConnectionService

The RiskConnectionService acts as a central hub for managing risk checks in your trading strategies. It intelligently directs risk-related operations to the correct risk management component based on a descriptive name you provide.  Think of it like a dispatcher – you tell it which "type" of risk to handle, and it takes care of the rest.

To improve performance, it remembers previously used risk management components, so it doesn't have to recreate them every time.

The service provides methods for validating signals against risk limits, registering new signals, and closing out existing ones. You can even clear the cache of previously used risk components if needed.  Strategies that don’t have specific risk configurations will use an empty string for the risk name.

## Class PositionSizeUtils

This class offers helpful tools for determining how much of an asset to trade in a backtest, making sure your position sizes are calculated correctly. It provides pre-built functions for several common sizing strategies, like using a fixed percentage of your account, the Kelly Criterion (a more advanced method aiming for optimal growth), and basing the size on the Average True Range (ATR) to account for volatility. Each function checks to make sure the information you provide is appropriate for the sizing method you've chosen. 

Essentially, this class simplifies the process of figuring out the right position size and helps prevent errors in your trading simulations.

Here’s a breakdown of the specific sizing methods available:

*   **fixedPercentage:** Calculates position size based on a set percentage of your account balance.
*   **kellyCriterion:** Uses the Kelly Criterion formula, requiring win rate and win/loss ratio data, to determine an optimal position size.
*   **atrBased:** Calculates position size considering the Average True Range, providing a way to adjust to market volatility.

## Class PersistSignalUtils

The `PersistSignalUtils` class helps manage how trading signals are saved and restored, particularly when a trading strategy is running live. Think of it as a keeper of your strategy's signal history. 

It's designed to be reliable, making sure that even if your system crashes, your signal data isn't lost or corrupted.  It does this by saving signal information to disk in a safe and consistent way.

The class automatically handles creating the storage for signals, and lets you customize *how* those signals are stored if you want to use a different method.

You can retrieve existing signal data using `readSignalData`, which looks up a signal based on the symbol and strategy name.  Conversely, `writeSignalData` is used to save new or updated signals, employing a technique called "atomic writes" to ensure data integrity. Finally, `usePersistSignalAdapter` allows you to plug in your own specialized storage mechanisms.

## Class PersistScheduleUtils

This class, PersistScheduleUtils, helps manage how your trading strategy's scheduled signals are saved and loaded, ensuring they don't get lost if something goes wrong. Think of it as a reliable memory for your strategy's plans.

It intelligently handles storing these signals separately for each strategy you're using, and it’s designed to work with different ways of storing data – you can even plug in your own custom storage methods.

The `readScheduleData` method fetches previously saved signal information, allowing your strategy to pick up where it left off, while `writeScheduleData` securely saves the current signal state. It's built to protect against data corruption by using atomic operations.

Finally, `usePersistScheduleAdapter` lets you customize exactly how the data is stored, giving you flexibility in how your strategy's scheduled signals are managed.

## Class PersistRiskUtils

This class, PersistRiskUtils, helps manage and save information about your active trading positions, specifically for different risk profiles. It's designed to keep things reliable, even if your system crashes.

Think of it as a safe place to store your position data, ensuring it's always up-to-date. It uses a clever system to avoid conflicts when multiple parts of your application are trying to access the same data.

You can customize how this data is stored, and it’s used by ClientRisk to load and save your active position state. The `readPositionData` method retrieves the saved positions, while `writePositionData` securely updates them. There’s also a way to plug in your own custom storage mechanisms using `usePersistRiskAdapter`.

## Class PersistPartialUtils

This class, PersistPartialUtils, helps keep track of your profit and loss levels, especially when things get tricky like a sudden system crash. It’s designed to work with the ClientPartial component to reliably save and restore this information.

Think of it as a safe deposit box for your trading data. It stores partial profit/loss information for each trading symbol, and it does so in a way that's crash-resistant.

It remembers where it stores data, so you don’t have to worry about re-finding it.

You can even customize how it saves data by plugging in your own storage adapter.

The `readPartialData` method fetches any previously saved profit/loss information for a specific symbol, giving you a head start when you restart.  If there’s no existing data, it simply returns nothing.

The `writePartialData` method is responsible for saving changes to your profit/loss levels, making sure the process is done safely and securely with atomic file writes, so data isn’t corrupted. 

Finally, `usePersistPartialAdapter` lets you use a different method to store and retrieve partial data, tailoring the system to your specific needs.

## Class PerformanceMarkdownService

The PerformanceMarkdownService helps you understand how your trading strategies are performing over time. It gathers performance data, organizes it by symbol and strategy, and then calculates key statistics like average returns, minimum returns, and percentiles.

This service creates separate storage areas for each combination of symbol and strategy, ensuring that the data remains isolated and organized. 

You can use it to generate clear, readable reports in Markdown format, which are saved to your logs directory. These reports provide a handy breakdown of performance and can even help pinpoint bottlenecks in your strategies. 

There's also a way to easily clear out the accumulated performance data when it's no longer needed. The service initializes itself when it starts up, but only does so once to avoid any issues.


## Class Performance

The Performance class helps you understand how your trading strategies are doing. It provides tools to gather and analyze performance data, making it easier to spot areas for improvement. 

You can use it to retrieve detailed statistics, such as the average execution time and volatility, for specific trading strategies and symbols. 

It also lets you create readable markdown reports that visualize performance, highlighting potential bottlenecks and providing a clear overview of your strategy’s behavior. You can even save these reports directly to your computer for later review and sharing.

## Class PartialUtils

This class is designed to help you analyze and understand your partial profit and loss data within the backtest-kit framework. Think of it as a tool to extract meaningful information and present it clearly.

It gathers data related to partial profits and losses, storing a limited history of events – up to 250 for each symbol and strategy combination.  You can use this class to get summary statistics, like total profit/loss counts, or to create detailed reports showing individual events.

The `getData` method lets you retrieve these overall statistics. The `getReport` method generates a well-formatted markdown document detailing all the partial profit/loss events for a specific symbol and strategy, presenting them in a table with essential information like action, symbol, signal ID, and price. Finally, the `dump` method takes that report and saves it as a markdown file, automatically creating the necessary directory if it doesn't exist – making it easy to share or review your results.

## Class PartialMarkdownService

This service helps you track and report on your partial profits and losses in a clear, organized way. It listens for events related to profits and losses and keeps a running tally for each symbol and strategy you're using.

The service automatically creates markdown reports detailing each event, including key information, and saves these reports to your computer.  You can also request statistics like the total number of profit and loss events recorded.

To use it, you don't need to manually initialize anything – it sets itself up automatically when you first start using it. It organizes data for each symbol-strategy combination separately, ensuring a clean and isolated view of performance. You have the option to clear this data when needed, either for a specific combination or all at once.

## Class PartialGlobalService

This service acts as a central hub for managing and tracking partial profits and losses within your trading strategies. Think of it as a layer that sits between your strategy logic and the underlying connection service that actually handles the details of partial tracking. It’s designed to be injected into your strategy, simplifying how you manage partials and providing a clear point for monitoring activity.

The main purpose is to provide a single entry point for managing partials, allowing for centralized logging to easily monitor what’s happening. It delegates the actual processing to a connection service while adding logging for global oversight.

Several services are injected into this component, including a logger, a connection service, and validation services to ensure your strategy and associated risk configurations are valid. You'll find methods for recording profits, losses, and clearing the partial state, all with associated logging before the work is passed on.


## Class PartialConnectionService

The PartialConnectionService helps track profit and loss for individual trading signals. It’s designed to manage and reuse data related to each signal, preventing unnecessary creation of objects.

Think of it as a central place to get and manage "ClientPartial" objects, which hold the details about a signal's profit and loss. It keeps track of these objects, reusing them whenever possible.

Whenever a profit or loss occurs, this service handles the details, making sure the information is recorded and events are triggered. When a signal is closed, it cleans up any associated data to keep things efficient. This service works closely with the overall trading strategy, making sure profit and loss calculations are accurate and well-managed.

## Class OutlineMarkdownService

The OutlineMarkdownService is designed to help you keep track of how your AI-powered trading strategies are working. It automatically creates a neatly organized folder structure to store important details from your strategy's conversations and results. 

Think of it as a digital diary for your AI – it saves the initial instructions given to the AI (the system prompt), each question you ask (user messages), and the AI's final answer along with the trading signal it produces. 

This service uses a logger to handle the writing of these files, and you don’t have to worry about accidentally deleting old records; it only creates files if the directory doesn't already exist. The generated markdown files are named to clearly indicate their content and order within the conversation. 


## Class OptimizerValidationService

This service helps keep track of your optimizers, ensuring they're properly registered and available for use. Think of it as a central registry for all your trading optimizers.

It lets you add new optimizers, making sure you don't accidentally register the same one twice.  You can also quickly check if an optimizer exists, and the system is smart about remembering those checks so it doesn't have to repeat the work.

If you need a complete list of all registered optimizers, it provides a simple way to retrieve that information.  Essentially, it’s designed to manage and validate your optimizers effectively.

## Class OptimizerUtils

OptimizerUtils offers helpful tools for working with and exporting your trading strategies. It allows you to retrieve previously generated strategy data, create complete code files ready to run, and easily save those code files to your desired location. 

You can use `getData` to gather information about your strategies, including details from different training periods.  `getCode` constructs the full code necessary for your strategy, bundling everything together. Finally, `dump` automates the process of creating and saving these strategy code files, organizing them neatly with a standardized naming convention.

## Class OptimizerTemplateService

This service acts as a central engine for creating the code snippets needed to run and optimize trading strategies. It's designed to work seamlessly with the Ollama LLM, allowing you to generate code that incorporates sophisticated analysis and trading logic.

It can handle a range of tasks, from setting up the basic exchange connection (like Binance) and defining timeframes (like 1-minute, 5-minute intervals) to crafting the core strategy configuration and generating signals. The generated code is structured, using JSON for signals and providing debug logging for troubleshooting.

You have the flexibility to customize certain aspects of the code generation process through configuration, allowing it to adapt to your specific needs. It can even generate code to compare different strategies, a process known as "walking."  The service also provides convenient helper functions for generating text and JSON output from the LLM, and for saving debugging information. The signals are structured with fields for position, note, price levels, and estimated time.

## Class OptimizerSchemaService

The OptimizerSchemaService helps you keep track of and manage different configurations for your optimizers. Think of it as a central place to store and organize how your optimizers are set up. 

It ensures that new optimizer configurations are properly validated before they're added, making sure they have all the necessary information. You can register new schemas, retrieve existing ones by name, and even update existing schemas with new information. 

Under the hood, it uses a registry to store these schemas, and it also provides a way to do a quick check of the basic structure of a schema. The service is designed to be reliable and consistent in how it handles optimizer configurations.

## Class OptimizerGlobalService

This service acts as a central point for working with optimizers, ensuring everything is validated before proceeding. It handles logging operations and checks to make sure the optimizer you're trying to use actually exists. 

Think of it as a gatekeeper for optimizer interactions.

It provides methods for retrieving data related to your optimizers, generating the complete code for them, and saving that code to a file. The `getData` method pulls together information from various sources to create strategy metadata. The `getCode` method constructs the full strategy code.  Finally, the `dump` method simplifies the process of creating and saving your strategy code to a file, again with the necessary validation checks in place.


## Class OptimizerConnectionService

The OptimizerConnectionService helps you easily work with optimizers in your backtesting system. It's designed to manage and reuse optimizer connections efficiently, preventing unnecessary overhead.

Think of it as a central hub for getting optimizer instances. It keeps a record of these instances, so it can quickly provide them when you need them again – this is called memoization and speeds things up considerably.

When you request an optimizer, it combines any custom templates you provide with default templates to create the final configuration.  It also allows you to inject a logger for tracking what’s happening.

You can use the `getOptimizer` function to retrieve an optimizer, `getData` to pull strategy metadata, `getCode` to generate the actual code, and `dump` to save the generated code to a file. This service simplifies the process of interacting with and using optimizers within your backtesting framework.


## Class LoggerService

The LoggerService helps standardize logging across your backtesting framework. It provides a consistent way to record events, automatically adding helpful details like which strategy, exchange, and timeframe the log relates to, as well as information about the asset being traded and the time of the action. If you don't configure a custom logger, it falls back to a "no-op" logger that essentially does nothing.

You can customize the logging behavior by setting your own logger implementation. The service includes properties to manage context information and a core `log` method that can be used for different severity levels like debug, info, and warn. This ensures your logs are informative and easy to understand.

## Class LiveUtils

LiveUtils helps you manage live trading operations with a focus on ease of use and reliability. It's designed as a central hub for running strategies in real-time and provides tools for monitoring and controlling them.

Think of it as a convenient way to kick off live trading sessions and keep them running smoothly. The `run` function is the core – it starts an infinite, automated process that continuously generates trading signals.  If things go wrong and the process crashes, it’s designed to automatically recover from any saved state.

You can also run strategies in the background using `background`, which is perfect if you just want to trigger actions or save data without needing to see the trading results directly.  Need to pause trading? The `stop` function gracefully halts the generation of new signals while allowing existing ones to complete.

Beyond just running, LiveUtils gives you ways to check in on how things are going. You can get statistics (`getData`), generate reports (`getReport` and `dump`), and even see a list of all active live trading instances (`list`) along with their current status. This makes it easy to keep track of what’s happening and troubleshoot any issues.

## Class LiveMarkdownService

The LiveMarkdownService helps you automatically create and save detailed reports of your live trading activity. It keeps track of every event – like when a strategy is idle, when a trade is opened or closed – and organizes them neatly into markdown tables.

You’ll find these reports saved in the logs/live/ directory, with a separate file for each strategy.  The service automatically gathers data and calculates key trading statistics like win rate and average profit.

Behind the scenes, it uses a specialized storage system to isolate data for each symbol and strategy combination. You don't need to worry about manually setting anything up; the service initializes itself automatically when you start using it.

The `tick` property is how the service receives updates, and you'll connect it to your strategy’s `onTick` callback. If you want to see just a portion of the data, you can specify which columns to include in the report. There’s also a `clear` function to easily wipe out accumulated data, either for a specific strategy or everything at once.

## Class LiveLogicPublicService

This service helps manage live trading sessions, making them easier to work with by automatically handling important details like the trading strategy and exchange being used. It essentially acts as a helper layer on top of another service, so you don't have to keep passing those details around every time you need to fetch data or generate signals.

Think of it as an ongoing stream of trading information - it runs indefinitely, constantly providing updates on what’s happening.  If something goes wrong and the process crashes, it can recover and pick up where it left off.

To start a live trading session, you simply tell it which symbol to trade and provide the strategy and exchange names. It then continuously generates results, blending real-time data with a mechanism for resilience in case of interruptions.

## Class LiveLogicPrivateService

This service helps automate live trading by continuously monitoring a symbol and reacting to signals. Think of it as a tireless worker that constantly checks for trading opportunities.

It operates in a loop, regularly checking the status of your trading signals and producing results. Importantly, it only reports when a trade is actually opened or closed, not when things are just running normally.

The process is designed to be efficient, streaming results to you without consuming excessive memory. It’s also built to be resilient; if something goes wrong, it can automatically recover and pick up where it left off.

You initiate the process using the `run` method, specifying the trading symbol you want to monitor. The `run` method returns an infinite generator, continuously providing updates as new trades are executed.

## Class LiveCommandService

This service acts as a central point for accessing live trading features within the backtest-kit framework. Think of it as a convenient helper, especially useful if you're injecting dependencies into your code. It bundles together several other services, including those for logging, validating strategies and exchanges, and handling schema information, as well as managing risk. 

The main function, `run`, is the core of this service. It kicks off the live trading process for a specific trading symbol, sending it information about the strategy and exchange you’re using. It continuously generates trading results – essentially giving you a stream of data as the live trading unfolds, with automatic recovery if things go wrong.

## Class HeatUtils

HeatUtils helps you visualize and analyze your trading strategy's performance using heatmaps. Think of it as a tool to quickly understand how different assets are contributing to your strategy's overall results. It gathers statistics across all your symbols within a strategy, making it easy to see which ones are performing well and which ones might need attention.

You can use it to:

*   **Retrieve Data:**  Get a detailed breakdown of your portfolio's performance – seeing things like total profit, Sharpe Ratio, and maximum drawdown for each individual asset within a strategy.
*   **Generate Reports:** Create easy-to-read markdown reports that present your portfolio’s heatmap in a nicely formatted table, sorted by profit.
*   **Save Reports:**  Automatically save these reports to a file on your computer, so you can keep track of your strategy's progress over time. 

This utility provides a simple way to access this information and is available as a single, readily accessible instance in your backtest kit.

## Class HeatMarkdownService

The Heatmap Service helps you visualize and understand how your trading strategies are performing by creating a portfolio-wide heatmap. It gathers data from closed trades, calculating key metrics like profit/loss, Sharpe Ratio, and maximum drawdown for both individual assets and your overall portfolio. 

Think of it as a tool that automatically builds reports, displayed in a readable markdown table, showing you the health of each strategy and the assets they trade. It's designed to be easy to use, handling potential errors gracefully and remembering data for each strategy separately. 

The service essentially listens for trading signals, collects the results, and then provides you with clear, organized reports. It handles the behind-the-scenes work of collecting and organizing data, allowing you to focus on interpreting the results and optimizing your strategies. You can even save these reports as markdown files for later review or sharing. It sets itself up automatically when you first use it, so there's no manual configuration required.

## Class FrameValidationService

This service helps you keep track of your trading timeframes and make sure they're set up correctly. Think of it as a central place to register all your different timeframe configurations, like daily, hourly, or weekly charts.

Before you start trading or analyzing data based on a specific timeframe, you can use this service to confirm it's been properly registered. It remembers which timeframes you've added, and it even keeps a record of whether they're valid so it doesn't have to check every time.

You can add new timeframes using `addFrame`, check if a timeframe exists with `validate`, and get a complete list of all your registered timeframes with `list`. This helps prevent errors and ensures your backtesting and trading strategies are running on the correct and valid timeframes.

## Class FrameSchemaService

This service acts as a central place to store and manage the blueprints, or schemas, that define how trading frames are structured. It uses a special type of storage to keep things organized and prevent errors. You can think of it like registering a new type of trading strategy – you give it a name, and the service remembers its details. 

If a schema already exists, you can update parts of it instead of replacing the entire thing. The service also checks new schemas to make sure they have the basic information they need before allowing them to be used.  You’ll use it to add, update, and retrieve these frame schemas by their assigned names.


## Class FrameCoreService

FrameCoreService helps manage the timeline of your backtesting process. It works behind the scenes to generate the dates and times your strategies will be evaluated against. Think of it as the engine that provides the historical data window for your backtest. 

It relies on other services like FrameConnectionService for actually getting the data and a validation service to ensure things are working correctly. 

The key function, `getTimeframe`, is what you’ll indirectly benefit from – it creates an array of dates based on the symbol (like "BTCUSDT") and the timeframe you've selected (like "1h" for one-hour candles). This array defines the period your backtest will cover.


## Class FrameConnectionService

The `FrameConnectionService` acts as a central hub for managing and accessing different trading frames within the backtest environment. It intelligently routes requests to the correct frame implementation, automatically determining which frame to use based on the current method context. 

To improve performance, it remembers previously created frames, so it doesn’t have to recreate them every time you need them.  

The service also handles backtesting timeframes – it can give you the start and end dates for a particular symbol and frame, allowing you to focus your backtest on specific periods.  

When running in live mode, frames aren’t used, and the `frameName` will be empty.

It relies on other services like `loggerService`, `frameSchemaService` and `methodContextService` for logging, frame schema information and context respectively. 

The `getFrame` method is how you request a specific frame, and the `getTimeframe` method helps define the boundaries for your backtest.

## Class ExchangeValidationService

This service helps keep track of your trading exchanges and makes sure they're properly set up before you start trading. Think of it as a central place to register each exchange you're using, like Binance or Coinbase. 

It lets you add new exchanges to its internal list, check if an exchange is valid before using it in your backtesting strategies, and quickly see a complete list of all the exchanges you’ve registered.  The system remembers previous validation checks to speed things up too. You can use it to make sure your backtest configurations are solid and avoid errors caused by misconfigured exchanges.

## Class ExchangeSchemaService

The ExchangeSchemaService helps you keep track of the different exchange configurations your trading system uses. It’s like a central library where you store and manage these configurations.

It uses a special system to ensure the configurations are correctly typed and structured, minimizing errors.

You can add new exchange configurations using `addExchange()`, and easily find existing ones by their names. If a configuration already exists, you can update parts of it using `override()`.  Before adding a new configuration, the system quickly checks if it has all the necessary components with `validateShallow()` to prevent issues later on.  Finally, the `get()` function allows you to retrieve a specific exchange configuration when you need it.

## Class ExchangeCoreService

The ExchangeCoreService acts as a central hub for interacting with exchanges, ensuring that important information like the trading symbol, time, and backtest settings are always considered. It combines the functionality of connection management and context awareness.

Inside, it keeps track of various services like logging, exchange connections, and validation.  It caches validation results to speed things up and logs what it’s doing.

You can use it to retrieve historical price data (candles), simulate fetching data from the future during backtesting, calculate average prices, and format price and quantity values, all while providing the necessary context for accurate calculations and operations.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges. It intelligently directs your requests to the correct exchange based on the current context, streamlining your trading logic.

It keeps track of exchange connections, so it doesn't have to re-establish them repeatedly, which makes things faster and more efficient. 

You can use it to retrieve historical price data (candles), get the latest average price, and format prices and quantities to adhere to the specific rules of each exchange. The service handles the complexities of working with various exchanges, allowing you to focus on your trading strategies.

## Class ConstantUtils

This class provides a set of pre-calculated values to help manage your take-profit and stop-loss levels, all based on a Kelly Criterion formula designed to gradually reduce risk. Think of these values as checkpoints along the way to your ultimate profit or loss target.

For example, if your goal is a 10% profit, `TP_LEVEL1` (set at 30) means the first take-profit trigger will occur when the price reaches 3% of that target, allowing you to lock in some early gains. `TP_LEVEL2` and `TP_LEVEL3` follow suit, capturing more profit as the price moves further.

Similarly, `SL_LEVEL1` and `SL_LEVEL2` offer protection by triggering stop-losses at different points, reducing your potential losses if the market moves against you. These levels are designed to create a layered approach to risk management.


## Class ConfigValidationService

This service acts as a safety net for your trading configurations, making sure they're mathematically sound and have a chance of being profitable. It digs deep into your settings, specifically looking at percentages like slippage and fees to confirm they're reasonable (non-negative). 

It also verifies the relationship between key parameters – for example, making sure your stop-loss distance makes sense relative to your take-profit distance. Beyond the basic math, the service checks that your configuration allows for enough profit to cover all trading expenses, including fees and slippage.

Finally, it looks at things like timeouts and retry counts to ensure they’re set to positive integer values, preventing unexpected behavior.  Essentially, it's a way to catch potential errors and ensure your strategy has a solid foundation. The `validate` function performs all these checks.

## Class ColumnValidationService

The ColumnValidationService helps keep your column configurations in good shape. It's designed to check your column definitions to make sure they follow the rules and don’t have any hidden problems. 

Think of it as a quality control system for your column setups. It verifies that each column has all the necessary pieces – a unique identifier (key), a descriptive name (label), a formatting method (format), and visibility settings (isVisible). It also ensures these keys are all distinct and that the format and visibility settings are actually functions, not just random data. Ultimately, this service helps prevent errors and inconsistencies in your data display. 

Here’s what it does:

*   Makes sure every column has the essentials: key, label, format, and isVisible.
*   Confirms that all ‘key’ values are unique so you don’t have any conflicts.
*   Checks that the `format` and `isVisible` settings are actually functions.
*   Verifies that the ‘key’ and ‘label’ are strings with content.

## Class ClientSizing

This component, called ClientSizing, helps determine how much of an asset to trade based on various strategies. It takes into account factors like a fixed percentage of your capital, Kelly Criterion principles, or Average True Range (ATR) to calculate position sizes. 

You can also set limits on the minimum and maximum positions you'll take, and restrict the maximum percentage of your capital used for any single trade. The ClientSizing component also allows you to add custom validation or logging steps to the sizing process, giving you more control and insight. Ultimately, it's used to figure out the right amount to buy or sell in each trade, based on the rules you define. 

The `calculate` method is the core function, doing the actual position size calculation based on input parameters.


## Class ClientRisk

ClientRisk helps manage the overall risk of your trading portfolio by setting limits and preventing strategies from taking actions that could exceed those limits. It's like a safety net for your strategies, ensuring they operate within defined boundaries.

This system tracks active positions across all your strategies, giving you a complete view of your portfolio's exposure. It uses a shared instance to enable analysis of risk across different strategies.

ClientRisk validates each trading signal before it's executed, checking against rules you've set, and can include custom validations tailored to your specific needs. It automatically handles the loading and saving of position data, ensuring that the risk checks are always based on the most up-to-date information.

You can register new signals as they open and remove them when they close, letting ClientRisk stay aware of what's happening in your portfolio in real-time. This process allows your strategies to execute safely, protecting you from potential losses.

## Class ClientOptimizer

The ClientOptimizer helps you manage and execute optimization processes. It's designed to gather information from various places, like different data sources, and then use that information to create and generate trading strategies. 

Think of it as a central hub that collects data, builds a history of interactions, and then pieces together the code for your strategies, ultimately allowing you to export this code to files. It receives progress updates and reports on its current state as it works.

It handles retrieving strategy data, generating the actual code for your trading strategy, and even saving that code to a file – creating any necessary folders along the way. This simplifies the process of building and deploying optimized trading strategies.

## Class ClientFrame

The `ClientFrame` is a core component responsible for creating the timelines your backtests use. Think of it as the engine that generates the sequence of dates and times your trading strategies will be tested against.  It cleverly avoids unnecessary work by remembering previously generated timelines, a technique called singleshot caching. You can customize the interval between these timestamps, ranging from one minute to three days.

It’s designed to be flexible, letting you add validation steps and log important events during the timeline generation process. The `ClientFrame` works closely with the backtesting logic to drive the historical analysis.

To get a timeframe, you call the `getTimeframe` function, providing the symbol you want to backtest.  This will return a promise that resolves to an array of dates, and it will store the result for future use.


## Class ClientExchange

This `ClientExchange` component helps your backtesting framework communicate with an exchange to get the data it needs. It's designed to be efficient in how it uses memory.

You can use it to retrieve historical price data, looking backward from a specific point in time.  It also allows you to fetch future price data, which is crucial for simulating trading scenarios.

It can calculate a Volume Weighted Average Price (VWAP) based on recent trading activity, which is useful for understanding price trends.  The number of candles considered for this calculation is determined by a global setting.

Finally, it takes care of formatting quantities and prices to match the specific rules of the exchange you're connected to, ensuring your orders look correct.

## Class BacktestUtils

This class, BacktestUtils, is your go-to helper for running backtests within the framework. Think of it as a convenient toolbox to manage your backtesting processes. It provides a simple way to execute backtests and track their progress.

You can start a backtest using the `run` method, which will give you a stream of results as it progresses.  For running tests in the background, like for logging or other side effects, use the `background` method.  It runs the test but doesn't show you the individual results.

If you need to halt a strategy's trading, the `stop` method gracefully pauses it. The `getData` function allows you to pull out the statistical results from completed backtests.  Need a nicely formatted report?  `getReport` generates a markdown document.  You can even save this report to a file with the `dump` method. Finally, `list` gives you a quick overview of all the backtests currently running and their status. A single instance of this utility class exists so that you can easily access these functionalities.

## Class BacktestMarkdownService

The BacktestMarkdownService helps you create and store reports about your trading backtests. It listens for signal events during a backtest and keeps track of how each strategy performed on different symbols. 

Think of it as a record-keeper that organizes all the closed trades for each strategy you’re testing. It then transforms that data into nicely formatted markdown tables, which are easy to read and understand.

You can use this service to generate complete reports for a specific symbol and strategy, or clear out all the accumulated data when you're finished. The reports are saved as markdown files in your logs directory, making it simple to review your backtest results. The service automatically handles creating the necessary directories and ensures it only initializes once.

## Class BacktestLogicPublicService

This service helps manage and run backtesting processes, streamlining the workflow. It essentially acts as a middleman, automatically handling important context information like the strategy name, exchange, and timeframe. 

You don't need to repeatedly pass this context data to functions – the service takes care of it behind the scenes.

The `run` function is the core; it executes a backtest for a given asset and provides results as a stream of data. This makes it easier to analyze the backtest's performance over time.


## Class BacktestLogicPrivateService

This service handles the complex process of backtesting a trading strategy. It works by first gathering timeframes from another service, then stepping through each one to simulate trading. 

When a signal tells the strategy to enter a trade, the service fetches the necessary historical price data and executes the strategy’s logic. It intelligently skips forward in time to the point where the signal closes, then reports the result of that trade.

Instead of storing all the results in memory at once, it streams them to you one by one, making it efficient for backtesting long periods of data.  You can even stop the backtest early if you need to by interrupting the stream. The `run` method is the main entry point – you give it a trading symbol, and it produces a continuous stream of backtest results.

## Class BacktestCommandService

This service acts as a central point for initiating and managing backtests within the backtest-kit framework. Think of it as a convenient way to trigger backtesting processes, providing access to various underlying services. It's designed to be easily integrated into your application through dependency injection.

It handles tasks like validating your trading strategy and the exchanges and data frames you're using. 

The key functionality is the `run` method, which lets you start a backtest for a specific trading symbol. When you call `run`, you need to provide information about the strategy, exchange, and data frame you want to use for the test, and it will return results as they become available.


# backtest-kit interfaces

## Interface WalkerStopContract

This interface defines the information shared when a walker is being stopped. Think of it as a notification saying, "Hey, we need to halt a specific trading strategy on a particular asset!" It includes the trading symbol, the name of the strategy being stopped, and the name of the walker that’s being interrupted. The walker name is important because you might have multiple walkers working on the same asset at once, and this lets you target the correct one. It's used when you need to pause or end a trading process within the backtest-kit framework.

## Interface WalkerStatisticsModel

The WalkerStatisticsModel helps organize and understand the results of backtesting different trading strategies. It builds upon the IWalkerResults interface, adding extra information for comparing strategy performance. 

The core of this model is the `strategyResults` property, which is a list of all the results gathered from running each strategy. This list allows for easy comparison and analysis of how different approaches performed during the backtest.

## Interface WalkerStatistics

WalkerStatistics helps you easily understand and compare the performance of different trading strategies. Think of it as a container holding all the results you get when running a backtest. 

It builds upon a standard result set, but adds extra information specifically designed to make comparing strategies much simpler.

The core of this structure is `strategyResults`, which is simply a list of all the results generated during the backtesting process. You’ll use this list to examine how each strategy fared.

## Interface WalkerContract

The WalkerContract describes what happens as backtest-kit runs comparisons between different trading strategies. Think of it as a notification you receive each time a strategy finishes its test run and its results are being assessed. 

It gives you a snapshot of the current state of the comparison, including details like the name of the strategy that just finished, the specific asset it was trading (symbol), and the exchange and timeframe used. 

You'll see key performance statistics for that strategy, along with the metric it was optimized for (like Sharpe Ratio or Sortino Ratio) and its value.  Crucially, it also tells you what the best performing strategy has been so far, along with its metric value, and how many strategies have been tested compared to the total number planned. This helps track progress during the backtest comparison process.

## Interface WalkerCompleteContract

This interface describes what's emitted when a backtesting process, known as a "walker," finishes running and all the results are ready. It packages up a lot of important information about the completed test. You'll find details like the name of the walker, the trading symbol being analyzed, the exchange and timeframe used, and the optimization metric being tracked. 

It also tells you how many strategies were tested, identifies the top-performing strategy, and provides the specific metric score and full statistical details for that best strategy. Essentially, it's a complete report card for a walker's run.


## Interface TickEvent

This interface, `TickEvent`, acts as a central container for all the data you receive about a trade event, no matter if it's a new signal, an open position, or a closed trade. Think of it as a standardized report card for each tick in your backtesting process. 

Each `TickEvent` has a timestamp, indicating when the event happened.  You’ll also find the `action` type—whether it’s an idle state, a new position being opened, a trade actively running, or a trade being closed.

For trades that are actively running, it holds details like the symbol being traded, the signal's ID, and the position type (long or short). It also provides key pricing information, including the opening price, take profit levels, stop loss levels, and progress towards those targets. 

When a trade is closed, the `TickEvent` includes information about the profit and loss, the reason for the closure, and how long the trade lasted. The `note` field provides additional context related to a specific signal.

## Interface SignalData$1

This data structure holds information about a completed trading signal, helping you analyze performance. Each signal is identified by a unique ID and associated with a specific strategy. It includes details like the trading symbol, whether the position was long or short, and the percentage profit or loss (PNL) achieved. You'll also find the reason for closing the signal, alongside the exact times the signal was opened and closed, allowing for detailed backtesting and performance evaluation.

## Interface ScheduleStatisticsModel

The `ScheduleStatisticsModel` helps you understand how your scheduled signals are performing over time. It tracks important metrics related to scheduling, activation, and cancellation.

You'll find a detailed list of all scheduled events in the `eventList` property. The model also provides counts for the total number of events, specifically how many were scheduled, opened (activated), and cancelled.

Key performance indicators like the `cancellationRate` and `activationRate` are included, showing you how often signals are cancelled versus activated, expressed as percentages. If signals are being cancelled frequently, you might want to review your scheduling logic.  Similarly, the `activationRate` can highlight areas for improvement in signal generation.

Finally, `avgWaitTime` and `avgActivationTime` give you insights into how long signals typically wait before being cancelled or activated, allowing you to fine-tune your timing strategies.

## Interface ScheduleStatistics

This object gathers statistics related to scheduled trading signals within the backtest-kit framework. It provides a comprehensive view of signal scheduling, activation, and cancellation activities.

You'll find a detailed list of every scheduled event, including when they were scheduled, opened, or cancelled, within the `eventList` property.  The `totalEvents` property simply counts the total number of events processed. You can also track specific numbers like the total scheduled signals (`totalScheduled`), the signals that were successfully activated (`totalOpened`), and the signals that were cancelled (`totalCancelled`). 

To gauge performance, the `cancellationRate` shows the percentage of scheduled signals that were cancelled – a lower rate is desirable. The `activationRate` shows what percentage of signals were actually opened for trading – a higher rate is better.  Finally, if you have cancelled or opened signals, you can see the average wait times (`avgWaitTime` and `avgActivationTime`, respectively) to better understand signal behavior.

## Interface ScheduledEvent

This interface, `ScheduledEvent`, neatly packages together all the details about events related to your trading signals – whether they were scheduled, opened, or cancelled. Think of it as a single container holding everything you need to analyze and report on these events.

Each `ScheduledEvent` includes the exact time it happened (`timestamp`), what type of event it was (`action`), the trading pair involved (`symbol`), and a unique identifier for the signal (`signalId`). You'll also find information about the trade itself, like the position type (`position`), any notes associated with the signal (`note`), and key price levels like the entry price (`priceOpen`), take profit (`takeProfit`), and stop loss (`stopLoss`).

For events that have ended, like cancelled or opened signals, you’ll also find additional data such as the close timestamp (`closeTimestamp`) and the duration the signal was active (`duration`). This makes it really easy to understand the entire lifecycle of a trading signal and how it performed.

## Interface RiskStatisticsModel

This model holds information about risk rejections, helping you understand where your risk management is being triggered. It collects data from individual rejection events, giving you a detailed list of each one. You'll find the total number of rejections overall, and also breakdowns showing how many rejections occurred for each symbol and for each strategy you’re using. This lets you easily pinpoint areas needing attention or adjustments in your risk controls.

## Interface RiskStatistics

This interface helps you understand how often and why risk rejections occurred during your backtesting. It gives you a detailed breakdown of risk events, allowing you to monitor and improve your risk management strategies. You’ll find a complete list of rejection events, a total count of rejections, and breakdowns categorized by the symbol and strategy involved. This information is valuable for identifying patterns and areas where your risk controls might need adjustments.

## Interface RiskEvent

This data structure represents an event triggered when a trading signal is rejected due to risk management rules. It provides detailed information about why a signal couldn't be executed. 

You’ll find the exact time the rejection happened, along with the symbol being traded, the specifics of the signal itself, and the name of the strategy and exchange involved. It also includes the current market price at the time of rejection, the number of positions already open, and a reason explaining why the signal was blocked. Think of it as a record of a risk limit being hit and preventing a trade.

## Interface RiskContract

The `RiskContract` represents a rejected trading signal due to risk validation. It's a record of when the system prevented a trade from happening because it exceeded defined risk limits.

Think of it as a notification whenever a trading strategy's request is blocked by the risk management system.

Key details included are the trading pair symbol (`symbol`), the specifics of the signal that was rejected (`pendingSignal`), which strategy requested it (`strategyName`), the exchange involved (`exchangeName`), the price at the time (`currentPrice`), how many positions were already open (`activePositionCount`), and a brief explanation of why it was rejected (`comment`). A timestamp (`timestamp`) marks exactly when the rejection occurred. This information helps you understand and monitor potential risk violations and is used for reporting and user notifications.

## Interface ProgressWalkerContract

This interface describes the updates you’ll receive as a background process, like analyzing strategies, runs. It lets you know what's happening during that process, giving you details like the name of the process, the exchange being used, and the trading symbol involved. You'll see the total number of strategies being evaluated, how many have been processed already, and the overall percentage of completion. Essentially, it's a way to monitor the progress of lengthy operations.

## Interface ProgressOptimizerContract

This interface helps you monitor the progress of your trading strategy optimizers. It provides updates during the optimization process, letting you know what's happening behind the scenes. You'll see information like the optimizer's name, the trading symbol being optimized (like BTCUSDT), the total number of data sources the optimizer needs to handle, and how many it's already processed. Finally, a percentage value shows you the overall completion of the optimization.

## Interface ProgressBacktestContract

This interface describes the updates you'll receive as a backtest runs in the background. It provides information about which exchange and strategy are being tested, the trading symbol involved, and how far along the backtest is. You’ll see the total number of historical data points (frames) the backtest will use, the number of frames it has already analyzed, and the overall progress as a percentage. This helps you monitor the backtest's status and estimate how much longer it will take to complete.


## Interface PerformanceStatisticsModel

This model holds all the performance data collected during a backtest or simulation. Think of it as a report card for your trading strategy. 

It includes the strategy's name so you know which strategy the data belongs to, as well as the total number of events and the overall execution time. 

The `metricStats` property provides a breakdown of performance by different categories, and the `events` property contains the complete raw data for detailed inspection. You can use this information to understand how well your strategy performed and pinpoint areas for improvement.


## Interface PerformanceStatistics

This object bundles together a strategy's performance data, giving you a clear picture of how it ran. It holds the strategy's name, the total number of events logged during the backtest, and the overall execution time.  You’ll also find a breakdown of statistics categorized by metric type, and a full list of the raw performance events for detailed inspection. Think of it as a comprehensive report card for a single trading strategy.

## Interface PerformanceContract

The `PerformanceContract` interface helps you keep tabs on how your trading strategies are performing. Think of it as a way to measure how long different parts of your system take to execute. 

It records key information like when an operation started and finished (`timestamp`, `previousTimestamp`), what type of operation it was (`metricType`), and how long it took (`duration`). You'll also find details linking it to specific strategies (`strategyName`), exchanges (`exchangeName`), and trading symbols (`symbol`). Finally, it indicates whether the data comes from a backtest or live trading environment (`backtest`). This data is invaluable for spotting slowdowns or areas for optimization within your trading framework.

## Interface PartialStatisticsModel

This model holds statistics about partial trades, giving you a snapshot of how your strategy performs when it takes profits or cuts losses early. It breaks down the data into a list of individual events, the total number of times those events occurred, and then separates that into the number of profitable events and the number of losing events. Think of it as a way to track the effectiveness of your partial trade management. You can access each event’s full details through the `eventList` array, while `totalEvents`, `totalProfit`, and `totalLoss` provide quick summary numbers.

## Interface PartialStatistics

PartialStatistics helps you keep track of how your trading strategy performs when it makes partial adjustments to positions. It gives you a detailed breakdown of each profit or loss event that occurred, letting you see exactly what happened and when. 

You can view a complete list of those events, along with their details, using the `eventList` property. To get a general sense of performance, you’ll also find the `totalEvents` count which represents all instances of profit and loss, and specific counts for `totalProfit` and `totalLoss` events. This allows you to monitor trends and understand the overall behavior of your strategy.

## Interface PartialProfitContract

The PartialProfitContract represents a signal achieving a specific profit milestone during trading. Think of it as a notification that your strategy has reached, say, a 20% profit target. It includes important details like the trading symbol (e.g., BTCUSDT), the strategy name generating the signal, and the exchange it's being executed on.

You'll also find the full details of the signal itself, the current market price at the time of the profit milestone, and, crucially, the profit level reached (10%, 20%, etc.). A flag indicates whether this event occurred during a backtest (historical data) or live trading. Finally, it contains a timestamp marking exactly when this profit level was detected.

This contract is used by systems to track performance and allows users to monitor their strategy's progress through callbacks. Events are designed to be deduplicated, and multiple levels can occur within a single market tick if prices fluctuate rapidly.

## Interface PartialLossContract

The PartialLossContract represents when a trading strategy hits a predefined loss level, like a 10% or 20% drawdown. Think of it as a notification that your strategy is experiencing a loss. It provides key information about this event, including the trading pair (symbol), the strategy's name, the exchange being used, and the complete details of the signal that triggered it.

You'll also find the current market price at the time of the loss, the specific loss level reached (e.g., 20% loss), and whether the event occurred during a backtest (historical data) or live trading.  A timestamp indicates when this loss level was detected, aligning with either real-time tick data or the candle's timestamp during backtesting. This information is useful for tracking how strategies perform under adverse conditions and for generating performance reports.

## Interface PartialEvent

This interface defines the data structure for partial profit and loss events, designed to be used when generating reports about a trading strategy's performance. Each event represents a milestone reached, such as hitting a 10% profit or a 20% loss level. 

The event records key details including when it happened (timestamp), whether it was a profit or loss, the trading pair involved (symbol), the name of the strategy, a unique identifier for the signal that triggered the trade (signalId), and the type of position held. You'll also find the current market price and the specific profit/loss level that was achieved. Finally, a flag indicates whether the event occurred during a backtest or a live trading session.

## Interface MetricStats

This interface, `MetricStats`, provides a detailed summary of how a particular metric has performed. It bundles together information like the total number of times the metric was recorded, the overall time spent, and key duration statistics. You’ll find insights into the average, minimum, and maximum durations, as well as measures of spread like standard deviation and percentiles (p95 and p99). 

It also tracks wait times, giving you the average, minimum, and maximum time between events related to the metric. Essentially, it's a comprehensive package for understanding the behavior of a specific metric within your backtesting framework.


## Interface MessageModel

This describes the structure of a message within a conversation, particularly useful for interacting with large language models. Think of it as a way to represent a single turn in a chat. Each message has a `role` which tells you who sent it – whether it’s the system providing instructions, the user asking a question, or the assistant (the LLM) responding.  The `content` property holds the actual text of the message itself. This model helps keep track of the conversation flow and context when building prompts for the LLM.

## Interface LiveStatisticsModel

The LiveStatisticsModel gives you a detailed look at how your live trading strategy is performing. It keeps track of everything from the total number of trades and signals to more advanced metrics like win rate and average profit per trade. You’ll find a list of every event – from initial signals to closed trades – and a comprehensive set of statistics to help you assess your strategy's risk and reward profile. 

Key performance indicators like total profit, win rate, and standard deviation are included, with explanations of what they mean and how to interpret them. It even calculates annualized Sharpe ratios and expected yearly returns to give you a longer-term view of potential performance. All numerical values are carefully checked to ensure accuracy, and will be flagged as unavailable if they can't be reliably calculated.

## Interface LiveStatistics

The `LiveStatistics` interface provides a detailed breakdown of your live trading performance. It’s designed to help you understand how your strategies are doing in real-time.

You'll find information about every event that occurred during trading, from initial setup to signal closures. This includes a complete list of all events. You can easily track the total number of events, and specifically the number of closed signals.

Key performance metrics like win count and loss count tell you how often your strategies are successful or unsuccessful.  The `winRate` gives you a quick percentage view of your profitability.  Beyond that, you get a deeper look at profitability with the average PNL per trade and the total cumulative PNL.

To assess risk, the standard deviation (or `stdDev`) is included - a lower value suggests less volatility.  Risk-adjusted performance is available with the Sharpe Ratio and Annualized Sharpe Ratio, both indicating how much return you’re getting for the level of risk taken.  Finally, the Certainty Ratio compares your average winning trade to the absolute value of your average losing trade, while the expected yearly returns estimate potential long-term gains.

Importantly, if any calculation results in an unsafe value like NaN or Infinity, the corresponding metric will be represented as null.

## Interface IWalkerStrategyResult

This interface describes the outcome of running a trading strategy within the backtest framework. Each strategy run produces a result containing its name, detailed performance statistics, a specific metric value used for ranking, and its final rank relative to other strategies in the comparison. The `stats` property holds a wealth of information about the backtest, such as total return, Sharpe ratio, and drawdown. The `metric` field provides a single, quantifiable value allowing for easy comparison across different strategies, and `rank` indicates how well the strategy performed in the overall group.

## Interface IWalkerSchema

The IWalkerSchema helps you set up A/B tests for different trading strategies within backtest-kit. Think of it as a blueprint for how you want to compare your strategies against each other.

You'll give it a unique name to identify the test, and optionally add a note for yourself. It specifies which exchange and timeframe to use for all the strategies involved.

Most importantly, you'll list the names of the strategies you want to test, making sure they've been registered beforehand. You can also choose which metric, like Sharpe Ratio, you want to optimize for. Finally, you can add optional callbacks to be notified about different stages of the testing process.

## Interface IWalkerResults

This interface holds all the information gathered when a backtest walker finishes its run. Think of it as a complete report card for a series of strategy tests. It tells you which asset, or "symbol," was being analyzed, along with the specific "exchange" and "walker" used for the tests. You'll also find the "frame" – the time period or data frequency – that was employed during the backtesting process. Essentially, it bundles together key identifying details from a backtest execution.

## Interface IWalkerCallbacks

This interface lets you hook into the backtest process and get notified about key events. You can listen for when a specific strategy begins testing, when it finishes (receiving performance statistics and a key metric), or if an error occurs during testing. Finally, there’s a callback that fires when all the backtests are complete, giving you the overall results. These callbacks provide visibility and control during the strategy comparison phase.

## Interface IStrategyTickResultScheduled

This interface describes what happens when a trading strategy creates a scheduled signal – essentially, a signal that's waiting for the price to reach a certain point before being activated. It provides key details about that signal, like the strategy and exchange it came from, the symbol being traded, and the current price at the time the signal was scheduled. The `action` property simply confirms that the signal is in the "scheduled" state, meaning it’s waiting for the price to match its entry point. You'll see this result when your strategy generates a signal that needs to wait for a price condition to be met.

## Interface IStrategyTickResultOpened

This interface describes the data you receive when a new trading signal is created within your backtest. It signifies that a signal has been successfully generated, validated, and saved. You'll find details about the signal itself, including its unique ID, the name of the strategy that produced it, the exchange it relates to, and the trading symbol involved.  The `currentPrice` property tells you the VWAP price at the moment the signal was opened, which is useful for analyzing performance. Think of this as a notification that a signal is ready to be acted upon.

## Interface IStrategyTickResultIdle

This interface represents what happens when your trading strategy is in a waiting period, essentially doing nothing. It tells you the strategy’s name, the exchange it’s connected to, the specific trading pair it's monitoring, and the current price at the time it went idle. The `action` property explicitly confirms that the state is "idle," and importantly, it indicates there's no active trading signal present at that moment; the `signal` is null. Think of it as a checkpoint to understand why your strategy isn’t actively trading.

## Interface IStrategyTickResultClosed

This interface describes the result you get when a trading signal is closed within a backtest. It provides a complete picture of what happened at the close, including the reason for closing (like reaching a take-profit target or a stop-loss), the price used to calculate profits, and the resulting profit and loss. 

You'll find details about the original signal that was executed, along with information about which strategy and exchange were involved. It also includes a timestamp marking exactly when the signal was closed, making it easy to track events in your backtest timeline. Essentially, this gives you a final, detailed report for each closed signal.


## Interface IStrategyTickResultCancelled

This interface describes what happens when a signal that was planned to be executed gets cancelled. It usually means the signal didn’t trigger a trade, perhaps because it was stopped before a position could be opened. 

The result includes details like the cancelled signal itself, the price at the time of cancellation, when the cancellation happened, and the strategy and exchange involved. Think of it as a record of a signal that didn’t lead to a trade, allowing you to track and understand why. 

Here’s what you can find in the record:

*   The reason for the result: It’s marked as "cancelled."
*   The specific signal that was cancelled.
*   The closing price when the cancellation occurred.
*   A timestamp of the cancellation event.
*   The name of the strategy responsible.
*   The exchange used.
*   The trading symbol, like BTCUSDT.

## Interface IStrategyTickResultActive

This interface describes a tick result within the backtest-kit framework when a trading strategy is actively monitoring a signal. It signifies that the strategy is waiting for a take profit, stop loss, or time expiration event. 

The result includes details like the strategy's name, the exchange and symbol being traded, and the current VWAP price used for monitoring. 

You'll also find the signal being tracked, along with percentage indicators showing progress towards both the take profit and stop loss levels. This data helps visualize the strategy’s current state and progress during a backtest.


## Interface IStrategySchema

This interface, `IStrategySchema`, acts as a blueprint for defining your trading strategies within the backtest-kit framework. Think of it as a way to describe *how* your strategy makes decisions.  You’ll use this schema when you register a new strategy, essentially telling the framework its name, a helpful note for yourself, and how often it should generate trading signals.

The core of the schema is the `getSignal` function – this is where your strategy's logic resides, determining when and what kind of trades to make.  It can even be configured to wait for price conditions before opening a trade.  You can also add optional callbacks to handle specific events like when a position is opened or closed. Finally, you can assign risk profiles, either single or multiple, to categorize and manage the risk associated with your strategy.

## Interface IStrategyResult

This interface, `IStrategyResult`, is designed to hold all the important information about a single strategy run during a backtest. Think of it as a single row in a comparison table showing how different strategies performed. Each result includes the strategy's name so you know which one it is, a detailed set of backtest statistics to understand its performance, and a numerical value representing the metric you’re using to judge its success – this value can be missing if the strategy didn’t run correctly. Essentially, it provides a clear and concise package of data for evaluating and comparing strategies.


## Interface IStrategyPnL

This interface, `IStrategyPnL`, represents the profit and loss (PnL) outcome of a trading strategy. It breaks down the performance, showing you how much you gained or lost, expressed as a percentage. The `pnlPercentage` property directly tells you the percentage change in your investment.

Crucially, the `priceOpen` and `priceClose` properties detail the actual prices used for the trade calculations. These prices have already been adjusted to account for typical trading costs, specifically a 0.1% fee and 0.1% slippage, giving you a more realistic view of your profitability.

## Interface IStrategyCallbacks

This interface, `IStrategyCallbacks`, lets you plug in functions to be notified about key events during a trading strategy's lifecycle. Think of it as a way to react to what's happening – whether a new signal is being created, a position is active, or a signal is closing. 

You can provide callbacks for when a new signal opens (`onOpen`), when it’s actively being monitored (`onActive`), when no signals are active (`onIdle`), and when a signal closes (`onClose`).  There are also hooks for scheduled signals, allowing you to respond to their creation (`onSchedule`) or cancellation (`onCancel`).

The `onTick` callback gives you the opportunity to react to every market tick.  You can even customize how data is persisted for testing purposes using `onWrite`.  Finally, you’re alerted to partial profit (`onPartialProfit`) or loss (`onPartialLoss`) scenarios. Each callback receives information like the symbol being traded, related data, and a flag indicating whether it’s a backtest.

## Interface IStrategy

The `IStrategy` interface outlines the core methods a trading strategy needs to have within the backtest-kit framework.

The `tick` method is the heart of the strategy, handling each incoming market tick. It's responsible for checking if a new trading signal should be generated and also monitoring any existing stop-loss or take-profit orders.

`getPendingSignal` allows a strategy to check the details of any active signal it has currently, like its remaining time or potential stop-loss levels.

You can use the `backtest` method to quickly test your strategy against historical data. It simulates trading based on a series of price candles.

Finally, the `stop` method is for pausing a strategy’s signal generation without abruptly closing any existing trades. This is useful when you need to shut down a live trading strategy gracefully.

## Interface ISizingSchemaKelly

This interface defines a sizing strategy based on the Kelly Criterion, a formula used to determine optimal bet size based on perceived edge. When implementing this strategy, you'll specify that the `method` is "kelly-criterion".  The `kellyMultiplier` property lets you control the aggressiveness of the sizing; a smaller value like 0.25 (the default) represents a "quarter Kelly" approach, which is more conservative, while larger values increase risk and potential reward. This allows you to fine-tune how much of your capital is allocated to each trade according to the Kelly Criterion calculations.

## Interface ISizingSchemaFixedPercentage

This schema defines a simple way to determine your trade size – by consistently risking a fixed percentage of your capital on each trade.  It's straightforward: you specify a `riskPercentage` which represents the portion of your account you're comfortable losing on a single trade, expressed as a number between 0 and 100. The `method` is always set to "fixed-percentage" to identify this specific sizing approach. This provides predictability and consistency in your risk management.

## Interface ISizingSchemaBase

This interface, `ISizingSchemaBase`, provides the foundation for defining how much of your account to allocate to a trade. It ensures consistency across different sizing strategies.

You'll find key properties here like `sizingName`, which gives your sizing strategy a unique identifier, and a `note` field for documenting its purpose. 

It also handles limits: `maxPositionPercentage` controls the maximum percentage of your account used in a single trade, while `minPositionSize` and `maxPositionSize` set absolute minimum and maximum trade sizes.  Finally, `callbacks` allows you to add custom logic triggered at different points in the sizing process.

## Interface ISizingSchemaATR

This schema defines how to size your trades using the Average True Range (ATR) indicator. It's a way to dynamically adjust your position size based on market volatility. 

You'll specify the sizing method as "atr-based" to confirm you're using this approach.

The `riskPercentage` determines what portion of your capital you're willing to risk on each trade, expressed as a number between 0 and 100.

Finally, `atrMultiplier` controls how much the ATR value influences the distance of your stop-loss order; a higher multiplier means a wider stop.

## Interface ISizingParamsKelly

This interface defines the parameters needed to use the Kelly Criterion for determining trade sizes within the backtest-kit framework. It's primarily used when setting up how your trading strategy decides how much to invest in each trade.

The `logger` property allows you to connect a logging service, which is helpful for debugging and understanding how the Kelly Criterion calculations are affecting your trade sizing. Think of it as a way to monitor the decisions being made behind the scenes.

## Interface ISizingParamsFixedPercentage

This interface defines how to set up your trading strategy's position sizing when using a fixed percentage approach. It essentially tells the backtest system what percentage of your available capital you want to risk on each trade. 

You'll use this to configure how much of your funds are allocated to each position based on a predetermined percentage. 

The `logger` property allows you to connect a logging service, which is useful for debugging and monitoring the sizing calculations during your backtesting runs – it lets you see what's happening behind the scenes.

## Interface ISizingParamsATR

This interface, `ISizingParamsATR`, helps you configure how much of your capital to allocate to trades when using an Average True Range (ATR) based sizing strategy.  It's used when setting up the `ClientSizing` object. 

The `logger` property is essential for troubleshooting and understanding what's happening behind the scenes; it allows you to receive debug messages about the sizing calculations. You'll need to provide a logger service that conforms to the `ILogger` interface.

## Interface ISizingCallbacks

The `ISizingCallbacks` interface lets you hook into different stages of the sizing process within the backtest-kit framework. Specifically, you can use the `onCalculate` callback to be notified whenever the framework determines how much to buy or sell. Think of it as a chance to observe and verify the sizing logic; perhaps you want to log the calculated quantity and the parameters used, or ensure the size makes sense given your strategy’s rules. It’s a way to peek under the hood and gain more insight into how your trades are being sized.

## Interface ISizingCalculateParamsKelly

This interface defines the information needed to calculate your trade size using the Kelly Criterion. It's all about figuring out how much of your capital to risk based on your trading strategy's performance. You'll provide your win rate, which represents the percentage of winning trades, and your average win/loss ratio, which tells you how much you win on a winning trade compared to how much you lose on a losing trade. These two values are then used to determine an optimal bet size that maximizes long-term growth.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the information needed to calculate trade size using a fixed percentage approach. It's used when you want to risk a specific percentage of your capital on each trade, based on a predetermined stop-loss price.  You’ll provide a `method` value confirming you're using the 'fixed-percentage' sizing method, and a `priceStopLoss` which acts as the basis for determining that percentage. Essentially, this lets you control how much of your account you're willing to lose on a single trade, tied to your risk management strategy.

## Interface ISizingCalculateParamsBase

This interface defines the basic information needed to figure out how much of an asset to buy or sell. It includes the trading pair you're working with, like "BTCUSDT", the total amount of money you have in your account, and the price at which you intend to make your first trade. Think of it as the foundation for calculating your trade size – you'll need to know these core details before you can determine how many assets you can realistically buy.


## Interface ISizingCalculateParamsATR

This interface defines the settings you’ll use when determining your trade size based on the Average True Range (ATR). Essentially, it tells the backtest kit how to calculate your position size using the ATR indicator. You’ll specify that you want to use the "atr-based" method and provide the current ATR value, which will be a number representing the recent volatility. Think of this as informing the system: "I want to size my trades according to this ATR value."

## Interface ISizing

The `ISizing` interface helps determine how much of an asset to trade in a strategy. It's the core of managing position sizes. 

Essentially, it provides a `calculate` method. This method takes in parameters defining your risk tolerance and trading context, and then returns the recommended quantity to buy or sell. Think of it as the brains behind deciding "how much" to trade, based on your strategy's rules.

## Interface ISignalRow

This interface, `ISignalRow`, represents a complete trading signal that’s been checked and confirmed for use within the backtest-kit framework. Think of it as the finalized version of a signal ready to be executed. Each signal has a unique identifier, `id`, which helps track it throughout the process. 

It also includes important details like the entry price (`priceOpen`), the exchange being used (`exchangeName`), and the specific strategy generating the signal (`strategyName`). 

You'll find timestamps for when the signal was initially created (`scheduledAt`) and when the position became pending (`pendingAt`). The symbol being traded, like "BTCUSDT", is also clearly defined. Finally, `_isScheduled` is an internal flag indicating that the signal was initially created as a scheduled event.

## Interface ISignalDto

This interface, `ISignalDto`, defines the structure for signal information used within the backtest-kit framework. It represents a trade suggestion, providing details like whether it's a "long" (buy) or "short" (sell) position.  You'll find fields for the reasoning behind the signal in the `note` property and the entry price in `priceOpen`. 

Crucially, it includes `priceTakeProfit` for setting a profit target and `priceStopLoss` for defining an exit point to limit potential losses – remember, these prices must relate logically to the entry price depending on the position direction.  Finally, `minuteEstimatedTime` indicates how long the signal is expected to remain active before potentially expiring.  The system automatically creates an ID for each signal.

## Interface IScheduledSignalRow

This interface, `IScheduledSignalRow`, represents a signal that's waiting for a specific price to be reached before a trade is executed. Think of it as a signal with a delayed trigger – it doesn’t act immediately. It builds upon the `ISignalRow` interface.

When a signal is created this way, it’s initially a "pending" signal, meaning it's ready to go but just waiting for the market to meet a certain condition.  

The `priceOpen` property specifies the price level that, when reached, will activate the signal and convert it into a standard, active signal.  The signal's "pending" time, or `pendingAt`, is tracked – it starts recording when the signal is scheduled and continues until the price is met, then reflects the actual time of activation.

## Interface IRiskValidationPayload

This interface, `IRiskValidationPayload`, holds all the information a risk validation function needs to make a decision. Think of it as a package delivered to the validation function containing details about what's happening. It includes the signal that's about to be acted upon (`pendingSignal`), the total number of positions currently open (`activePositionCount`), and a list of those active positions (`activePositions`). This allows the risk checks to consider the existing portfolio state when evaluating new trades.

## Interface IRiskValidationFn

This defines a special function type used to check if your trading strategy's risk settings are safe and reasonable. Think of it as a quality control check for your strategy. It's designed to take the risk parameters – things like maximum position size or leverage – and verify they fall within acceptable limits. If the validation fails, the function will throw an error, stopping you from accidentally deploying a strategy with potentially dangerous risk levels. It helps ensure your backtesting is conducted with safe and controlled parameters.

## Interface IRiskValidation

This interface, `IRiskValidation`, helps you define how to check if a trading action is safe. Think of it as setting up rules to prevent risky trades. 

It has two main parts: a `validate` function, which is the actual logic you’ll write to perform the check, and an optional `note` field. The `note` is just a helpful description to explain what the validation is doing – it’s like adding a comment to your code to make it clearer to others (and yourself later!).  You use this to ensure trades meet specific criteria before they’re executed.

## Interface IRiskSchema

This interface, `IRiskSchema`, lets you define and register risk controls for your trading portfolio. Think of it as a way to set up rules and checks to manage your risk exposure. 

Each schema has a unique name (`riskName`) so you can identify it later. You can also add a note (`note`) to explain what the schema is for. 

To make things even more flexible, you can provide optional callbacks (`callbacks`) to react to specific events. Most importantly, you define your actual risk logic with a list of validations (`validations`). These validations are functions or objects that check your portfolio's status and determine if a trade should be allowed or rejected.


## Interface IRiskParams

This interface, `IRiskParams`, defines the essential settings you provide when setting up your risk management system within the backtest-kit framework. It’s like configuring the guardrails for your trading strategies.

You'll use a `logger` to keep track of what's happening – handy for debugging and understanding why decisions are being made. 

The `onRejected` callback is crucial; it’s triggered when a trading signal gets blocked because it would violate your risk limits. Think of it as the notification you receive when the guardrails kick in – you can use this opportunity to log the details, perhaps send an alert, or take other actions before the rejection is finalized.


## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, holds all the information needed to decide if a new trade should be allowed. Think of it as a safety check performed before a trading signal is actually generated. It provides details like the trading pair symbol (e.g., BTCUSDT), the signal itself, the name of the strategy requesting the trade, the exchange being used, the current price, and the timestamp of the current market data. Essentially, it bundles all the relevant context for a risk assessment.

## Interface IRiskCallbacks

This interface lets you define functions that get triggered when your trading strategy's risk checks either pass or fail. Think of it as a way to be notified about potential risk issues or successful risk assessments. You can specify a callback function, `onRejected`, which will be executed whenever a trading signal is blocked because it violates your risk rules. Conversely, `onAllowed` lets you celebrate when a signal makes it through the risk checks and is safe to proceed with. These callbacks provide a flexible way to monitor and react to risk events within your backtesting or live trading environment.

## Interface IRiskActivePosition

This interface describes a position that a trading strategy currently holds, and that the ClientRisk component is keeping track of. It's useful for understanding how different strategies are interacting and affecting overall risk.

Each position has details like the signal that triggered it, the name of the strategy that created it, the exchange where the trade took place, and the exact time the position was opened. This information helps in analyzing risk across multiple strategies simultaneously.


## Interface IRisk

The `IRisk` interface helps manage and enforce risk limits within your trading strategies. It acts as a gatekeeper, ensuring your signals don't violate predefined risk boundaries.

You can use `checkSignal` to determine if a trading signal is permissible, providing details about the signal for evaluation. 

`addSignal` lets you register when a new position is opened, keeping track of active trades.  Conversely, `removeSignal` notifies the system when a position is closed, updating the risk profile accordingly. This interface allows you to monitor and control your risk exposure in a structured way.


## Interface IPositionSizeKellyParams

The `IPositionSizeKellyParams` interface helps you calculate position sizes using the Kelly Criterion, a popular method for determining how much to bet or trade based on your expected return. It defines the parameters needed for this calculation. You'll provide your estimated win rate, expressed as a number between 0 and 1, and your average win/loss ratio – essentially, how much you win on average for every loss. These values are key to the Kelly Criterion formula and will guide your position sizing strategy.


## Interface IPositionSizeFixedPercentageParams

This interface defines the parameters needed to calculate a position size using a fixed percentage of your portfolio. It's specifically used when you want to risk a certain percentage of your capital per trade.

The `priceStopLoss` property tells the system at what price you'll place a stop-loss order for the trade. This helps determine the amount of capital needed to calculate the appropriate position size.

## Interface IPositionSizeATRParams

The `IPositionSizeATRParams` interface defines the settings you provide when calculating position size using an Average True Range (ATR) approach. It's a straightforward set of parameters designed to help you determine how much capital to allocate to a trade based on market volatility. The key piece of information you’ll provide is the `atr` value, which represents the current Average True Range—essentially, a measure of how much the price fluctuates. This value is crucial for calculating a suitable position size that accounts for the market's volatility.

## Interface IPersistBase

This interface defines the basic functions for saving and retrieving data within the backtest-kit framework. Think of it as the foundation for how your trading strategies’ data is stored and loaded. It provides methods to ensure your storage area is properly set up, quickly check if a piece of data exists, read data back from storage, and reliably write new data. These functions are designed to work together, ensuring your data is handled safely and consistently.


## Interface IPartialData

This data structure helps save and restore information about a trading signal's progress. Think of it as a snapshot of key details, specifically the profit and loss levels that have been hit. Because some data types can't be directly saved, sets of profit and loss levels are converted into simple arrays for storage. This allows the framework to remember where a signal stood even after it's been stopped or the application restarted.

## Interface IPartial

The `IPartial` interface helps track how trading signals are performing financially, whether they're making a profit or a loss. It's used internally by the system to monitor signals and notify users when certain milestones are hit.

When a signal is making money, the `profit` method is triggered. It checks if the signal has reached predefined profit levels like 10%, 20%, or 30% and sends out notifications for any new levels achieved. The `loss` method works similarly, but for signals experiencing losses, tracking levels like 10%, 20%, or 30% loss.

Finally, when a signal closes, whether due to a take profit, stop loss, or time expiry, the `clear` method cleans up the tracked data, removes it from memory, and saves any necessary changes. This ensures the system doesn't continue to monitor signals that are no longer active.

## Interface IOptimizerTemplate

This interface provides a way to create code snippets and messages for use with Large Language Models (LLMs) within the backtest-kit framework. Think of it as a toolkit for building custom backtesting environments powered by LLMs.

It includes methods to generate various configuration code blocks, such as setting up the initial environment (`getTopBanner`), crafting user and assistant messages for LLM conversations (`getUserMessage`, `getAssistantMessage`), and defining components like Walkers, Exchanges, Frames, and Strategies. You can also use it to create helper functions for debugging and generating structured or text-based outputs from the LLM. Ultimately, these methods help you automate the process of setting up and running backtesting experiments.

## Interface IOptimizerStrategy

This interface, `IOptimizerStrategy`, holds all the information about a trading strategy that's been created using an LLM. Think of it as a container for everything needed to understand how the strategy came to be. It includes the trading symbol the strategy is designed for, a unique name to identify it, and the full conversation history with the LLM that shaped the strategy. Importantly, it also stores the actual strategy description or logic as text, which is what you’ll use to implement the trading rules.


## Interface IOptimizerSourceFn

The `IOptimizerSourceFn` is essentially a function that provides the data your backtest optimization process uses to learn and improve. Think of it as a data feed specifically designed for training an algorithm. It needs to be able to handle large datasets by fetching data in smaller chunks (pagination), and crucially, it must give each piece of data a unique identifier. This unique ID is important for tracking and managing the data during the optimization process.

## Interface IOptimizerSource

This interface describes a data source used for optimizing strategies, particularly for feeding information into large language models. Think of it as a way to tell backtest-kit where to get your historical data and how to present it in a format the LLM can understand.

You'll give it a unique name to easily identify the data source and can add a short description for clarity. The most important part is the `fetch` function, which tells backtest-kit how to retrieve your data, and it needs to support bringing data in chunks.

Finally, you have the flexibility to customize how the data is formatted into user and assistant messages for the LLM. If you don’t specify custom formatters, backtest-kit will use its own default templates.

## Interface IOptimizerSchema

This interface, `IOptimizerSchema`, acts as a blueprint for setting up and registering optimizers within the backtest-kit framework. Think of it as defining the entire process of generating and testing strategies. 

It lets you specify a descriptive note, a unique name for your optimizer, and crucially, define different training and testing time periods to evaluate performance. The `source` property allows you to incorporate multiple data sources that feed information into the strategy generation process.

You’ll use `getPrompt` to craft the specific prompt sent to the language model to generate your strategies, using the accumulated data.  You also have the option to customize the generation process using `template` or monitor the optimizer's lifecycle through `callbacks`. This schema gives you a lot of control over how strategies are created and assessed.

## Interface IOptimizerRange

This interface, `IOptimizerRange`, helps you set the boundaries for your backtesting and optimization periods. Think of it as defining a specific timeframe for your analysis. It's made up of a `startDate` and an `endDate`, both representing dates within your historical data. You can optionally add a `note` to describe what that timeframe represents, like "Early 2023 growth" or "Post-pandemic recovery." This allows you to clearly label and understand the purpose of each range you define.

## Interface IOptimizerParams

This interface, `IOptimizerParams`, holds the settings needed to create a ClientOptimizer. Think of it as a container for essential components.

It includes a `logger` which is used to display helpful messages during the optimization process – this is automatically provided.

It also bundles a `template` which defines the methods available for the optimization, combining your custom settings with some default behaviors.

## Interface IOptimizerFilterArgs

This interface, `IOptimizerFilterArgs`, defines the information needed to efficiently fetch data for backtesting. It specifies which trading symbol you're interested in, like "BTCUSDT", and the exact start and end dates for the data you need. Think of it as setting the boundaries for the historical data the backtest will use – it helps the system quickly locate the relevant information without unnecessary searching.

## Interface IOptimizerFetchArgs

When you're working with data that needs to be pulled in chunks, `IOptimizerFetchArgs` helps manage how much data is fetched at a time. It lets you specify a `limit`, which is the maximum number of records to retrieve in a single request – think of it as the page size. You also control the `offset`, which tells the system how many records to skip before starting to fetch – this is how you move between pages. By adjusting these two values, you can efficiently handle large datasets.

## Interface IOptimizerData

This interface, `IOptimizerData`, serves as the foundation for how data is provided to the backtest kit's optimization tools. Think of it as a standard format that ensures all data sources can be used consistently. Each piece of data, represented as a "row," must have a unique identifier, called `id`. This ID is crucial for preventing duplicate data entries, especially when dealing with large datasets pulled from various sources in chunks or pages.

## Interface IOptimizerCallbacks

This interface lets you listen in on what’s happening during the optimization process. Think of it as a way to get notified at key moments and potentially react to what’s going on.

You can be alerted when data is gathered for a particular strategy, allowing you to check its validity or record it for later analysis. Similarly, you'll receive notifications when code is generated and written to a file.

Specifically, you’ll get callbacks when:

*   Strategy data is ready for all training periods.
*   The generated strategy code is complete.
*   The code has been saved to a file.
*   Data has been retrieved from a data source. 

This allows you to monitor, log, or even modify the behavior of the optimization process as it progresses.

## Interface IOptimizer

This interface defines how you interact with the optimization process within the backtest-kit framework. Think of it as a way to request data, generate code, and save that code to a file for your trading strategies.

The `getData` method pulls all the necessary information for a given trading symbol, preparing it for strategy creation. It essentially gathers data and organizes it in a format suitable for further processing.

`getCode` lets you build a complete, runnable trading strategy as a string of code.  It combines all the necessary components like imports and the actual strategy logic.

Finally, `dump` takes the generated code and saves it to a file.  It handles creating any necessary folders and ensures the file ends with the `.mjs` extension.

## Interface IMethodContext

This interface, `IMethodContext`, helps the backtest-kit framework know which specific configurations to use when running simulations or tests. Think of it as a set of instructions that tells the system *which* strategy, exchange, and data frame to work with.  It carries names—like "strategyName" and "exchangeName"—so the framework can automatically pull in the right settings for each operation.  When you're running a live test, the "frameName" will be empty, signifying that no historical data frame is needed. Essentially, it streamlines the process of connecting different parts of your trading logic.

## Interface ILogger

The `ILogger` interface defines how different parts of the backtest-kit framework communicate about what’s happening. It provides a simple way to record important events, details, and potential issues within the system. 

You can use it to keep track of things like when agents start or finish, when data is saved, or if any problems are encountered. 

The `log` method is for general messages, `debug` is for very detailed information useful during development, `info` provides a summary of normal operations, and `warn` flags potential concerns that need to be looked into. This helps with understanding and troubleshooting the backtest’s behavior.

## Interface IHeatmapStatistics

This structure organizes the overall performance data for your portfolio, giving you a snapshot of how everything is doing. It provides a breakdown of statistics across all the assets you're tracking.

You'll find an array detailing the performance of each individual symbol, alongside key metrics like the total number of symbols in your portfolio, the total profit and loss (PNL) across everything, the portfolio’s Sharpe Ratio, and the total number of trades executed. Essentially, it’s a central place to see how your entire investment strategy is performing.

## Interface IHeatmapRow

This interface represents a row in the portfolio heatmap, providing a snapshot of performance for a single trading symbol like BTCUSDT. It gathers key statistics from all strategies applied to that symbol, giving you a clear picture of its overall trading results.

You'll find metrics like total profit or loss percentage, the Sharpe Ratio which gauges risk-adjusted returns, and the maximum drawdown, indicating the biggest potential loss experienced. Other important details include the total number of trades, win/loss counts, win rate, average profit/loss per trade, and measures of volatility like standard deviation.

The interface also includes useful indicators of trading consistency such as the longest winning and losing streaks, and the expectancy, a calculation that estimates potential profit based on win and loss patterns.  Essentially, it summarizes everything you need to know about a symbol’s performance in one convenient object.

## Interface IFrameSchema

This defines a blueprint for how your backtesting environment handles time – essentially, it's a way to describe a specific "frame" of time for your trading strategy.  Each frame has a unique name to identify it, and you can add a note to help explain its purpose. The `interval` property sets how frequently time advances within the frame (e.g., every minute, hour, or day).  You also specify the start and end dates that define the backtest period for this frame, marking the beginning and end of the data being analyzed. Finally, you can optionally attach functions (callbacks) to be executed at certain points during the frame’s lifecycle.

## Interface IFrameParams

The `IFramesParams` interface defines the information needed when creating a ClientFrame, which is a core component of backtest-kit. It builds upon `IFramesSchema` and crucially includes a `logger` property. This `logger` allows you to easily track and debug what's happening within the frame during your backtesting process, providing valuable insights for troubleshooting and optimization. Essentially, it's your window into the inner workings of the frame.

## Interface IFrameCallbacks

This interface defines functions that are called during the lifecycle of a timeframe frame within the backtest-kit. Specifically, the `onTimeframe` property lets you provide a function that will be executed whenever a new set of timeframes is created. This is a handy way to track what timeframes are being generated, check if they're what you expect, or perform any other actions related to the timeframe construction process. You'll get the actual timeframe dates, the start and end dates used to create them, and the interval used as input to the timeframe generation.

## Interface IFrame

The `IFrames` interface is a core component that helps structure your backtesting process. Think of it as the mechanism for creating the timeline your trading strategies will operate on. It provides a way to generate a list of specific dates and times, spaced out according to how frequently your strategy needs to make decisions – whether that’s every minute, hour, day, or something else.  The `getTimeframe` function is key; you'll use it to request a set of timestamps for a particular trading symbol and timeframe, and it returns those timestamps as a `Promise` resolving to an array of `Date` objects, ready to be used in your backtest.

## Interface IExecutionContext

The `IExecutionContext` interface provides essential information about the current trading environment. Think of it as a package of data passed around to different parts of your trading strategy, like when you’re fetching historical data or receiving new price updates. It tells your strategy what trading pair it's working with (the `symbol`), exactly when the operation is happening (`when`), and crucially, whether it’s running a backtest – a simulation using historical data – or a live trade. This context allows your strategies to behave differently depending on the situation, ensuring proper data handling and order execution.

## Interface IExchangeSchema

This interface describes how backtest-kit interacts with different cryptocurrency exchanges. Think of it as a blueprint for connecting to a specific exchange's data. You'll use it when you want backtest-kit to pull historical price data and execute trades based on a particular exchange's rules.

Each exchange has a unique identifier, and you can add a note for documentation purposes. The most important part is `getCandles`, which tells backtest-kit *how* to get the historical candle data – essentially, the API endpoint or database query to use.

`formatQuantity` and `formatPrice` handle the specific formatting rules that exchanges use for trade sizes and prices.  Finally, `callbacks` allows you to hook into certain events, like when new candle data arrives, giving you more control.

## Interface IExchangeParams

The `IExchangeParams` interface helps set up your simulated trading environment within backtest-kit. Think of it as the configuration you pass when creating an exchange object. It includes a logger, which allows you to track what's happening during your backtesting process and see helpful debugging messages.  You also provide an execution context, which tells the exchange things like the trading symbol, the time period being backtested, and whether it's a backtest or a live execution. This context is crucial for ensuring your trading logic behaves correctly within the simulation.


## Interface IExchangeCallbacks

The `IExchangeCallbacks` interface lets you hook into events happening when your backtest kit framework connects to an exchange.  Specifically, you can provide a function – `onCandleData` – that gets called whenever the framework retrieves historical or live candlestick data. This function will receive the symbol being traded, the time interval of the candles (like 1 minute, 1 hour, etc.), a timestamp indicating when the data started, the number of candles requested, and an array containing the actual candle data. Essentially, it's your opportunity to react to incoming candlestick information.

## Interface IExchange

The `IExchange` interface defines how backtest-kit interacts with exchanges, letting you access historical and future market data. You can request historical candle data using `getCandles`, which looks backward from the current time. Need to peek into the future for backtesting? `getNextCandles` fetches candles moving forward.

When placing orders, `formatQuantity` and `formatPrice` ensure your order sizes and prices are correctly formatted to match the exchange's requirements.  Finally, `getAveragePrice` provides a simple way to calculate the VWAP (Volume Weighted Average Price) based on recent trading activity, helping you understand the average price a large number of trades occurred at.

## Interface IEntity

This interface, `IEntity`, serves as the foundation for anything that gets saved and retrieved from storage within the backtest-kit framework. Think of it as the common ancestor for all your data objects, ensuring they all share a basic structure. It's designed to provide a consistent way to interact with your persistent data, regardless of its specific type. If you're creating a class that represents something you need to store, it should likely implement this interface.

## Interface ICandleData

This interface represents a single candlestick, which is a standard way to organize price data over a specific time period. Each candlestick contains information about the opening price, the highest price, the lowest price, the closing price, and the trading volume during that time. The `timestamp` tells you exactly when that candlestick's period began. This data is essential for analyzing price movements and for running backtests of trading strategies.

## Interface HeatmapStatisticsModel

This model organizes data to visualize your portfolio's performance using a heatmap. It provides a summary of how your investments are doing across all the assets you're tracking.

You'll find an array called `symbols`, which holds detailed statistics for each individual asset in your portfolio.  The `totalSymbols` property simply tells you how many assets are included in the analysis.  Key performance indicators like the total profit/loss (`portfolioTotalPnl`), the Sharpe Ratio (`portfolioSharpeRatio` – a measure of risk-adjusted return), and the total number of trades (`portfolioTotalTrades`) are also included, giving you a broad overview of the portfolio's activity.

## Interface DoneContract

This interface represents what happens when a background task, either in a backtest or live trading environment, finishes running. You'll receive an object like this when a `Live.background()` or `Backtest.background()` call completes. It tells you which exchange was used, the name of the strategy that ran, whether it was a backtest or live execution, and the trading symbol involved. Think of it as a confirmation message with details about the finished background process.

## Interface ColumnModel

This describes how to configure a column when creating tables for your backtest results. Think of it as defining what information you want to display and how it should look. You'll give each column a unique identifier (`key`), a friendly name for the header (`label`), and a way to transform the data into a readable string (`format`). You can even control whether a column is shown or hidden based on certain conditions using the `isVisible` function. Essentially, this lets you customize the presentation of your data to highlight the information most important to your analysis.

## Interface BacktestStatisticsModel

BacktestStatisticsModel gives you a detailed look at how your trading strategy performed. It collects a wealth of information from your backtest, allowing you to evaluate its strengths and weaknesses. 

You’ll find a complete list of every trade that was closed, along with its details, in the signalList. The totalSignals property simply tells you how many trades were executed.

To assess profitability, you can check the winCount and lossCount, and calculate the winRate – the percentage of profitable trades.  You'll also see the avgPnl, representing the average profit per trade, and the totalPnl, which shows the overall cumulative profit.

To understand the risk involved, the standard deviation (stdDev) provides a measure of volatility – lower values indicate less risk. The Sharpe Ratio, and its annualized version, factor in both return and risk, providing a more nuanced view of performance.  CertaintyRatio offers a comparison of average winning and losing trade sizes, while expectedYearlyReturns attempts to estimate potential annual gains. 

Keep in mind that any numerical values marked as "null" are unreliable, often due to issues like calculations involving infinite or undefined numbers.

## Interface BacktestStatistics

This object provides a comprehensive set of statistics derived from your backtesting runs, allowing you to evaluate strategy performance. It contains a detailed list of every closed trade, including price data and profit/loss information. You'll find key metrics like the total number of trades, the number of winning versus losing trades, and the win rate – essentially, the percentage of profitable trades. 

Beyond basic counts, it also tracks average profit/loss per trade, total cumulative profit, and measures of risk like standard deviation and the Sharpe Ratio, which helps assess risk-adjusted returns. A higher Sharpe Ratio generally indicates better performance for the level of risk taken. The certainty ratio tells you the relative strength of winning trades compared to losing trades, and expected yearly returns gives you an idea of potential annual gains. Keep in mind that any numeric value might be missing (represented as null) if the calculation resulted in an unstable or undefined result.
