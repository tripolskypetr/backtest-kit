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

This function helps you make sure everything is set up correctly before you run your trading simulations or optimizations. It checks if all the different components you're using – like exchanges, trading strategies, and risk management systems – are properly registered within the backtest-kit framework.

You can tell it to validate just specific components, or if you leave it blank, it’ll check *everything* for you. This is a really useful way to catch any configuration errors early on and prevent unexpected issues during your backtesting process. Think of it as a quick health check for your entire trading setup.

## Function setLogger

You can now control how backtest-kit reports its activities by providing your own logger. This lets you route log messages to a file, a database, or any other destination you prefer.  The framework will automatically add helpful context to each log message, such as the strategy name, exchange, and trading symbol, making it easier to understand what's happening during backtesting. To do this, simply create a logger that conforms to the `ILogger` interface and pass it to the `setLogger` function.

## Function setConfig

This function lets you adjust how the backtest-kit framework operates. You can change certain settings to customize the environment for your backtesting needs. Think of it as tweaking the underlying rules of the game. If you're working in a testbed environment and need to bypass some of the standard checks, there's a flag you can use to skip those validations. Just be careful when bypassing validations, as it's intended for specific testing scenarios.

## Function setColumns

You can customize the columns displayed in your backtest reports using this function. It lets you change the default settings for columns like price, quantity, or any other data you want to see. Think of it as tailoring the report to show exactly what you need.  If you're working within a testbed environment and need to bypass some of the usual checks, there's a special flag you can use, but be careful when doing that! The framework makes sure your column configurations are correct before applying them.

## Function listWalkers

This function lets you see all the different "walkers" that are set up within the backtest-kit framework. Think of walkers as individual steps or processes in your trading strategy's evaluation. It provides a list of descriptions for each walker, allowing you to understand what's happening behind the scenes. This is really helpful if you're trying to figure out how your strategy is working or if you want to create tools that automatically display information about your walkers.

## Function listStrategies

This function helps you discover all the trading strategies that your backtest-kit system knows about. It essentially gives you a list of descriptions for each strategy, outlining what they do and how they work. Think of it as a way to see all the different trading approaches available within your system, which can be really helpful for understanding the system's capabilities or creating tools to manage those strategies. You can use this list to check what's been added or to build user interfaces that dynamically show available strategies.


## Function listSizings

This function lets you see all the different sizing strategies that are currently set up within your backtesting environment. It provides a straightforward way to get a list of these configurations, which is helpful when you're troubleshooting, creating documentation, or building user interfaces that need to reflect these sizing rules. Think of it as a quick peek at how your positions are being sized for trades. The result is a list of objects, each describing a sizing schema.

## Function listRisks

This function lets you see all the risk assessments your backtest is set up to handle. It essentially provides a comprehensive overview of all the potential risks the system is prepared to evaluate. Think of it as a way to check what kinds of things the backtest is looking out for, which can be helpful when you're troubleshooting or building user interfaces that need to display risk information. The function returns a list of risk schemas, giving you access to the details of each risk assessment.

## Function listOptimizers

This function lets you see all the optimization strategies that are currently set up within your backtest kit. It provides a straightforward way to get a list of available optimizers, which is helpful for understanding what's happening behind the scenes, creating documentation, or dynamically building user interfaces that need to interact with these optimizers. Essentially, it's a look under the hood at your optimization options.


## Function listFrames

This function lets you see all the different data structures, or "frames," that your backtest kit is using. It's like getting a list of all the tables in a database. You can use this to check if everything is set up correctly, generate documentation, or even build user interfaces that adapt to the frames you're working with. Essentially, it provides a quick overview of the data organization within your backtesting system.

## Function listExchanges

This function helps you find out what trading exchanges are set up and ready to use within your backtest kit. It gives you a list of information about each exchange, like what data they provide and how they work. Think of it as a way to see all your connected marketplaces at once – great for checking things, generating documentation, or creating user interfaces that adapt to the available exchanges. It fetches this information from the system's registry of exchanges.


## Function listenWalkerProgress

This function lets you keep track of how a backtest is progressing, particularly as each trading strategy finishes running. It provides updates as the backtest completes each strategy, ensuring you receive events in the order they happen. Importantly, it handles the callback function you provide in a safe way, preventing potential issues caused by running multiple callbacks at the same time. You give it a function to be called for each progress update, and it returns a function you can use to unsubscribe from these updates later.

## Function listenWalkerOnce

This function lets you react to specific events happening within a trading simulation, but only once. You tell it what kind of event you're looking for using a filter, and then provide a function to execute when that event finally occurs. Once the event is found and the function runs, the listener automatically stops, so you don't have to worry about managing subscriptions yourself. It’s a quick way to respond to a particular condition without continuously monitoring the system.

Here's a breakdown of how it works:

*   You give it a filter, like "look for a walker event where the price crosses a certain threshold."
*   You then tell it what you want to *do* when that event happens, like "execute this trading strategy."
*   The function listens, finds the event, runs your action, and then quietly stops listening.


## Function listenWalkerComplete

This function lets you get notified when a backtest run finishes. It’s like setting up a listener that gets triggered once the testing of all your trading strategies is done. The good part is that the notification happens in a reliable order, even if the notification itself involves some asynchronous processing. It makes sure that the completion events are handled one at a time to prevent any unexpected issues. You provide a function, and this function will be called when the backtest completes, giving you the details of the completion event.

## Function listenWalker

This function lets you keep an eye on how a backtest is progressing. It's a way to be notified after each trading strategy finishes running within a larger backtest. Think of it as getting updates as the backtest completes each step. 

The updates you receive are called "WalkerContract" events, and you provide a function (`fn`) to handle them. Importantly, these updates are processed one at a time, even if your function takes a little time to complete, ensuring things stay orderly. You can unsubscribe from these updates whenever you need to by calling the function that `listenWalker` returns.

## Function listenValidation

This function lets you keep an eye on potential problems happening during your risk validation checks. It’s like setting up an alert system – whenever a validation process throws an error, this function will notify you. These notifications are handled one at a time, even if the notification itself involves some asynchronous work, ensuring things are processed in order. You can use it to spot and fix errors in your validation rules, making your trading strategy more robust. To use it, you provide a function that will be called whenever an error occurs.

## Function listenSignalOnce

This function helps you react to a specific trading signal just once and then stop listening. You tell it what kind of signal you're looking for with a filter – a way to check if the signal meets your criteria. Once it finds a signal that matches, it runs your provided callback function. After that, it automatically stops listening, so you won't be bothered by further signals. It’s handy when you need to react to a particular condition and don’t want to keep monitoring indefinitely.

You provide a function to check the signal (`filterFn`) and a function to run when the signal is found (`fn`). The `filterFn` decides whether the signal is the one you're interested in.

## Function listenSignalLiveOnce

This function lets you set up a listener to receive live trading signals, but only once. You provide a filter to specify which signals you're interested in, and a function to handle those signals. The listener will run once when a matching signal arrives from a live backtest execution, then it automatically stops listening. Think of it as a temporary ear to the live trading stream that closes itself after hearing something you want.


## Function listenSignalLive

This function lets you tap into the live trading signals generated by backtest-kit. It's like setting up a listener that gets notified whenever a new signal is available during a live run.  The signals are delivered one at a time, ensuring they are processed in the order they were received. You provide a function that will be called with each signal, allowing you to react to the live trading activity as it happens.  Keep in mind that this listener only works with signals from a `Live.run()` execution.

## Function listenSignalBacktestOnce

This function lets you react to specific events happening during a backtest run, but only once. You tell it which events you're interested in by providing a filter – think of it as a rule that decides whether an event should be passed on. When an event matches your rule, a function you provide gets executed just one time, and then the subscription automatically stops. It’s helpful for one-off actions like logging a specific trade or performing a calculation when a certain condition is met during the backtest.

## Function listenSignalBacktest

This function lets you tap into the backtest process to receive updates as it runs. It’s like setting up a listener that gets notified whenever a signal event happens during a backtest.  You provide a function that will be called with these updates, one at a time, in the order they occurred.  This is useful if you need to react to events during the backtest, but you want to ensure they’re handled in the correct sequence. Remember that this only works while a backtest is actively running with `Backtest.run()`. The function returns another function which you can call to unsubscribe from these events.

## Function listenSignal

This function lets you tap into the trading signals generated by backtest-kit. It's a way to be notified whenever a strategy changes state – whether it's idle, opening a position, actively trading, or closing a position. The magic is that it handles these notifications in a safe and orderly way, ensuring that your code that responds to the signals runs one step at a time, even if your code takes a little time to process each signal. You provide a function that will be called with the details of each signal event, and the function returns another function you can use to unsubscribe later.

## Function listenRiskOnce

This function lets you temporarily listen for specific risk-related events within your trading strategy. You provide a filter that defines which events you're interested in, and a function that will execute once when a matching event occurs.  After that single execution, the listener automatically stops, so you don’t need to worry about manually unsubscribing. Think of it as a way to react to a particular risk condition just once and then move on. It's handy for things like triggering a specific action the first time a risk threshold is breached.

## Function listenRisk

This function lets you monitor when your trading signals are being blocked because of risk rules. It’s like setting up an alert that only goes off when something's flagged as too risky. You provide a function that will be called whenever a signal is rejected due to a risk check failing – crucially, you *won’t* receive notifications for signals that pass the risk validation. The function will execute in order, one after another, even if your callback is asynchronous, ensuring things don’t get out of control. This queued approach prevents multiple callbacks from running at the same time, keeping things organized and predictable.

## Function listenPerformance

This function lets you monitor how long different parts of your trading strategy take to run. Think of it as a way to profile your code and find slow spots. It sends updates about timing metrics as your strategy is executing. 

The updates are handled one at a time, even if the function you provide takes some time to process, ensuring a controlled flow of information. It's perfect for spotting areas where your strategy could be more efficient.

You give it a function that will be called whenever a performance metric is available. When you're done listening, the function returns another function that you can use to unsubscribe.

## Function listenPartialProfitOnce

This function lets you set up a one-time alert for when a specific profit level is reached during backtesting. You provide a condition – a function that checks each profit level event – and a callback function that gets executed *only once* when that condition is met. Once the callback runs, the listener automatically stops, so you don't need to worry about manually unsubscribing. Think of it as a way to react to a particular profit milestone and then forget about it.

Here's a breakdown:

*   You tell it what to look for using `filterFn`.
*   You define what should happen when it finds a match with `fn`.
*   It handles the subscription and unsubscription automatically.

## Function listenPartialProfit

This function lets you keep track of your trading progress as you reach certain profit milestones, like 10%, 20%, or 30% gains. It's like setting up a notification system that tells you when you've hit those targets. Importantly, the notifications will be delivered one at a time, even if the handling of a notification takes some time, ensuring everything is processed in the right order. You simply provide a function that will be called each time a partial profit level is reached, and this function will manage the timing to keep things smooth.

## Function listenPartialLossOnce

This function allows you to react to specific partial loss events within your backtest, but only once. You provide a condition – a filter – that determines which loss events you're interested in. Once an event matches that condition, a callback function you define will be executed. After that single execution, the function automatically stops listening, so you don't have to worry about managing subscriptions manually. It's handy when you need to react to a particular loss situation and then move on.

You give it two things: a way to identify the loss events you care about (the filter) and the action you want to take when one of those events happens (the callback).

## Function listenPartialLoss

This function lets you keep track of how much your trading strategy has lost along the way. It sends you notifications when the losses hit specific milestones, like 10%, 20%, or 30% of the total investment.  The good news is that these notifications are handled one at a time, ensuring your code doesn't get overwhelmed even if the callback you provide takes some time to execute. You provide a function that gets called whenever a partial loss event occurs, and this function returns another function which you can use to unsubscribe from these events later.

## Function listenOptimizerProgress

This function lets you keep an eye on how your optimization process is going. It sends updates as the optimizer works, letting you know about progress in a reliable way. The updates are handled one at a time, even if your update handling code takes some time to complete, ensuring nothing gets missed or overlaps. You provide a function that will be called whenever there's a progress update, and this function returns another function that you can use to unsubscribe from those updates later.

## Function listenExit

The `listenExit` function lets you be notified when the backtest-kit framework encounters a serious, unrecoverable error that will halt execution. Think of it as an emergency alert system for your backtesting environment – it's triggered when things go wrong in a way that can’t be handled during normal operation.  This is different from `listenError`, which deals with issues that can be addressed and the process can continue.

When a fatal error occurs within background processes like `Live.background`, `Backtest.background`, or `Walker.background`, this function will call your provided callback function.  The callback receives an `Error` object detailing what happened.

Crucially, these errors are handled one at a time, and even if your callback function involves asynchronous operations, it will run sequentially to ensure consistent error processing and prevent conflicts. It’s a way to ensure you can gracefully handle these critical situations.


## Function listenError

This function lets you set up a listener that catches errors occurring during your trading strategy's execution. Think of it as a safety net for situations like API calls that might fail – the strategy won’t just crash; instead, it will keep running.

The listener receives these errors, allowing you to handle them in a controlled way.  The errors are dealt with one at a time, in the order they happen, even if your error handling logic itself takes some time to complete. To keep things stable, the system ensures that your error handling routine doesn’t run concurrently with other parts of your strategy. 

You provide a function (`fn`) that gets called whenever a recoverable error occurs, and this function will be unsubscribed when you no longer need to listen for errors.

## Function listenDoneWalkerOnce

This function lets you react to when a background task within backtest-kit finishes, but only once. You provide a filter to specify which completed tasks you're interested in, and then a function that will be called when a matching task finishes. After that single execution, the subscription automatically stops, so you don't need to worry about cleaning it up. Think of it as a one-time notification for specific task completions.

It's particularly useful when you need to perform a single action based on the completion of a background process, like updating a UI element or triggering a subsequent process.

## Function listenDoneWalker

This function lets you keep track of when background tasks within your backtest finish running. It’s designed to handle events that signal the completion of these tasks, ensuring they're processed one at a time even if the function you provide takes some time to execute. You give it a function that will be called when a background task is done, and it returns a function you can use to unsubscribe from these notifications later. Think of it as a way to be notified in a controlled sequence when things finally wrap up in the background.

## Function listenDoneLiveOnce

This function lets you react to when a background task finishes running, but only once. You provide a filter to specify which finished tasks you're interested in, and a function to execute when a matching task completes. Once that function runs, the subscription automatically stops, so you don't need to worry about manually unsubscribing. Think of it as a one-time notification for specific background task completions.


## Function listenDoneLive

This function lets you keep an eye on when background tasks, specifically those started with `Live.background()`, finish running. It's like setting up a notification system for these tasks. When a background task is done, the function will call a callback you provide. Importantly, these completion notifications are handled in the order they come, and your callback function can be asynchronous without causing any problems – it will be processed safely and sequentially. Think of it as a reliable way to know when those long-running background processes have completed their work.


## Function listenDoneBacktestOnce

This function lets you react to when a background backtest finishes, but only once. You provide a filter to specify which backtest completions you're interested in – it's like setting up a specific condition. Once a backtest meets that condition, your provided function will run, and then the subscription automatically stops, preventing it from triggering again. It's a convenient way to handle a single event from a background backtest without needing to manage manual unsubscriptions.


## Function listenDoneBacktest

This function lets you be notified when a background backtest finishes running. It's designed to handle the completion gracefully, ensuring that any code you provide to respond to the event runs one step at a time, even if it involves asynchronous operations. You give it a function that will be called when the backtest is done, and it returns a function you can use to unsubscribe from these notifications later if needed. Think of it as setting up a listener to be alerted when a particular task completes.

## Function listenBacktestProgress

This function lets you keep an eye on how a backtest is progressing. It sets up a listener that gets triggered during the background calculations of a backtest. 

The updates you receive are handled one at a time, even if the function you provide takes some time to process each update. This ensures that the progress information is managed safely and without causing unexpected issues. You give it a function to run when progress updates happen, and it returns another function you can call to stop listening.

## Function hasTradeContext

This function simply tells you if the environment is ready for trading actions. It verifies that both the execution and method contexts are set up correctly. Think of it as a quick check to make sure everything is in place before you try to fetch data or perform calculations related to trades. If it returns `true`, it means you’re good to go and can safely use functions that rely on the trading context.

## Function getMode

This function simply tells you whether the system is currently running a backtest or operating in a live trading environment. It returns a promise that resolves to either "backtest" or "live," giving you a straightforward way to adjust your code's behavior based on the current context. Think of it as a quick check to ensure you're using the correct data or logic for the situation.

## Function getDefaultConfig

This function provides you with a set of pre-defined settings used by the backtest-kit. Think of it as a starting point for configuring your trading strategies. It gives you a read-only object containing various parameters like retry counts, slippage percentages, and signal generation limits. Examining the values in this default configuration can help you understand the framework’s behavior and what options you can customize for your specific needs.

## Function getDefaultColumns

This function gives you a peek at the default column setup used when creating markdown reports. It provides a configuration object outlining the columns for backtesting results, heatmaps, live data, partial events, performance metrics, risk analysis, scheduling, walker signals, and strategy results. Think of it as a handy guide to understand the available column types and their initial settings – a great way to explore what's possible before customizing your own report layouts. You can inspect the returned object to see how each column is defined by default.

## Function getDate

This function, `getDate`, simply tells you what the current date is within your trading simulation or live trading environment. If you're running a backtest, it will give you the date associated with the specific historical timeframe you're analyzing. If you're trading live, it returns the actual, current date. It's a straightforward way to access the date relevant to your trading activity.

## Function getConfig

This function lets you peek at the settings that control how backtest-kit operates. It gives you a snapshot of the global configuration, like how many candles to average for price calculations or limits on signal lifetimes. Importantly, the function provides a copy of these settings, ensuring that your inspection doesn't accidentally change the actual running configuration. Think of it as a read-only window into the framework’s inner workings, useful for understanding and debugging.

## Function getColumns

This function lets you peek at the column setup used for generating reports. Think of it as getting a snapshot of how your data will be displayed. It provides different column configurations for various aspects like closed trades, heatmaps, live data, partial events, performance metrics, risk assessments, scheduled events, walker signals, and strategy results. Importantly, it gives you a copy so you can examine it safely without changing the actual configuration.

## Function getCandles

This function lets you retrieve historical price data, like open, high, low, and close prices, for a specific trading pair. You tell it which trading pair you're interested in (like "BTCUSDT"), how frequently the data should be grouped (e.g., every 1 minute, every 5 minutes, every hour), and how many data points you want.  It pulls this information directly from the exchange you're connected to, going back in time from the current moment.  Essentially, it's your way to get the historical chart data you need for analysis or backtesting.


## Function getAveragePrice

This function, `getAveragePrice`, helps you figure out the average price of a trading pair like BTCUSDT. It uses a method called VWAP, which takes into account how much of the asset was traded at different prices. Specifically, it looks at the last five minutes of trading data to calculate this average, considering both price and volume. If there's no trading volume to work with, it falls back to calculating a simple average of the closing prices. You just need to provide the symbol of the trading pair you’re interested in to get the result.

## Function formatQuantity

This function helps you prepare quantity values correctly for trading. It takes a trading symbol like "BTCUSDT" and a numerical quantity, then converts it into a string formatted according to the rules of that specific exchange. This ensures you're sending the right amount in your orders, handling decimal places precisely as required by the exchange. Think of it as making sure your order quantity looks exactly how the exchange expects it.

## Function formatPrice

This function helps you display prices in a way that follows the rules of the specific exchange you're trading on. It takes a symbol like "BTCUSDT" and a raw price number, and then formats the price correctly, ensuring the right number of decimal places are shown. Think of it as automatically handling the details of how prices *should* look for each trading pair. This makes your application more consistent and user-friendly because it presents prices in a familiar format.


## Function dumpSignal

This function helps you save detailed records of your AI trading strategy's decisions. It takes the conversation with the AI, along with the resulting trading signal, and organizes it into easy-to-read markdown files. Think of it as creating a debug log – you’ll get files showing the system prompts, each user message, and the AI's final output, all neatly structured and labeled with a unique identifier for the trade. It's designed to help you analyze how your strategy is working and identify any issues.  The function won’t overwrite existing files, so your past analyses are safe. You can specify where these files should be saved, or it will default to a "dump/strategy" folder.


## Function addWalker

This function lets you register a "walker" – essentially a tool that runs multiple trading strategies against the same historical data and then compares how well they performed. Think of it as setting up a competition between your strategies to see who comes out on top. You provide a configuration object, the `walkerSchema`, which tells the walker how to execute the tests and what metrics to use for the comparison. This enables you to get a more holistic view of your strategies' strengths and weaknesses by seeing how they stack up against each other.

## Function addStrategy

This function lets you tell backtest-kit about a new trading strategy you’ve created. Think of it as registering your strategy so the framework knows how to use it. When you add a strategy, backtest-kit will check to make sure it's set up correctly – that its signals are valid, that signals aren't being sent too frequently, and that it can safely handle unexpected interruptions if you're running it live. You provide a configuration object describing your strategy, and the framework takes care of the rest.

## Function addSizing

This function lets you tell the backtest framework how to determine your position sizes. Think of it as setting up your risk management rules. You provide a configuration object that outlines things like whether you want to size based on a fixed percentage of your capital, a Kelly Criterion approach, or using Average True Range (ATR). The configuration also includes details about your risk tolerance, how to cap your positions, and even allows you to define custom logic for calculating sizes with callbacks. Essentially, you're defining how much of your capital you'll risk and how many shares or contracts you'll buy or sell based on the signals you receive.

## Function addRisk

This function lets you set up how your trading strategies manage risk. Think of it as defining the boundaries for how much your system can trade at once and putting in extra checks to make sure everything stays safe. You can specify the maximum number of positions your strategies can hold simultaneously, and even create custom rules based on things like portfolio metrics or how different strategies correlate with each other. This setup helps prevent your strategies from taking on too much risk and allows for coordinated risk management across multiple strategies.

## Function addOptimizer

This function lets you tell backtest-kit about a new optimizer you've built. Think of an optimizer as a system that automatically creates trading strategies – it gathers data, uses large language models to craft prompts, and then generates working backtest code. By registering your optimizer, you're essentially adding a new way for the framework to generate trading strategies based on your custom logic. The optimizer will produce a complete, runnable file with all the necessary settings and code for a backtest.

## Function addFrame

This function lets you tell backtest-kit about the different timeframes you want to use in your backtesting simulations. Think of it as defining how your data is organized – whether you’re working with daily, hourly, or even minute-by-minute data. You provide a configuration object that specifies the start and end dates for your backtest, the frequency of the timeframes (like 1-minute intervals), and a way to generate those timeframes. Essentially, you're setting up the backbone for how your historical data will be processed during the backtest.

## Function addExchange

This function lets you tell backtest-kit about a new data source for trading, like a specific cryptocurrency exchange. Think of it as registering where the framework will pull historical price data and other essential information. You provide a configuration object that defines how the framework should interact with that exchange, including how to get historical candle data, format prices and quantities, and even calculate a common trading indicator like VWAP. This allows the backtest-kit to simulate trades against the data from your chosen exchange.
