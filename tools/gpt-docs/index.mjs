import { globSync } from "glob";
import { basename, join, extname, resolve } from "path";
import { str, retry } from "functools-kit";
import { Ollama } from "ollama";
import { Agent, setGlobalDispatcher } from "undici";
import fs from "fs";

setGlobalDispatcher(
  new Agent({
    headersTimeout: 60 * 60 * 1000,
    bodyTimeout: 0,
  })
);

const MODULE_NAME = "backtest-kit";

const ollama = new Ollama({ host: "http://127.0.0.1:11434" });

const DISALLOWED_TEXT = ["Summary:", "System:", "#"];

const GPT_CLASS_PROMPT =
  "Please write a summary for that Typescript API Reference of backtest-kit trading framework with several sentences in more human way";

const GPT_INTERFACE_PROMPT =
  "Please write a summary for that Typescript API Reference of backtest-kit trading framework with several sentences in more human way";

const GPT_FUNCTION_PROMPT =
  "Please write a summary for that Typescript API Reference of backtest-kit trading framework with several sentences in more human way";

const HEADER_CONTENT =
  "# backtest-kit api reference\n" +
  "\n" +
  "![schema](../../assets/uml.svg)\n" +
  "\n" +
  "**Overview:**\n" +
  "\n" +
  "Backtest-kit is a production-ready TypeScript framework for backtesting and live trading strategies with crash-safe state persistence, signal validation, and memory-optimized architecture. The framework follows clean architecture principles with dependency injection, separation of concerns, and type-safe discriminated unions.\n" +
  "\n" +
  "**Core Concepts:**\n" +
  "\n" +
  "* **Signal Lifecycle:** Type-safe state machine (idle → opened → active → closed) with discriminated unions\n" +
  "* **Execution Modes:** Backtest mode (historical data) and Live mode (real-time with crash recovery)\n" +
  "* **VWAP Pricing:** Volume Weighted Average Price from last 5 1-minute candles for all entry/exit decisions\n" +
  "* **Signal Validation:** Comprehensive validation ensures TP/SL logic, positive prices, and valid timestamps\n" +
  "* **Interval Throttling:** Prevents signal spam with configurable intervals (1m, 3m, 5m, 15m, 30m, 1h)\n" +
  "* **Crash-Safe Persistence:** Atomic file writes with automatic state recovery for live trading\n" +
  "* **Async Generators:** Memory-efficient streaming for backtest and live execution\n" +
  "* **Accurate PNL:** Calculation with fees (0.1%) and slippage (0.1%) for realistic simulations\n" +
  "* **Event System:** Signal emitters for backtest/live/global signals, errors, and completion events\n" +
  "* **Graceful Shutdown:** Live.background() waits for open positions to close before stopping\n" +
  "* **Pluggable Persistence:** Custom adapters for Redis, MongoDB, or any storage backend\n" +
  "\n" +
  "**Architecture Layers:**\n" +
  "\n" +
  "* **Client Layer:** Pure business logic without DI (ClientStrategy, ClientExchange, ClientFrame) using prototype methods for memory efficiency\n" +
  "* **Service Layer:** DI-based services organized by responsibility:\n" +
  "  * **Schema Services:** Registry pattern for configuration with shallow validation (StrategySchemaService, ExchangeSchemaService, FrameSchemaService)\n" +
  "  * **Validation Services:** Runtime existence validation with memoization (StrategyValidationService, ExchangeValidationService, FrameValidationService)\n" +
  "  * **Connection Services:** Memoized client instance creators (StrategyConnectionService, ExchangeConnectionService, FrameConnectionService)\n" +
  "  * **Global Services:** Context wrappers for public API (StrategyGlobalService, ExchangeGlobalService, FrameGlobalService)\n" +
  "  * **Logic Services:** Async generator orchestration (BacktestLogicPrivateService, LiveLogicPrivateService)\n" +
  "  * **Markdown Services:** Auto-generated reports with tick-based event log (BacktestMarkdownService, LiveMarkdownService)\n" +
  "* **Persistence Layer:** Crash-safe atomic file writes with PersistSignalAdaper, extensible via PersistBase\n" +
  "* **Event Layer:** Subject-based emitters (signalEmitter, errorEmitter, doneEmitter) with queued async processing\n" +
  "\n" +
  "**Key Design Patterns:**\n" +
  "\n" +
  "* **Discriminated Unions:** Type-safe state machines without optional fields\n" +
  "* **Async Generators:** Stream results without memory accumulation, enable early termination\n" +
  "* **Dependency Injection:** Custom DI container with Symbol-based tokens\n" +
  "* **Memoization:** Client instances cached by schema name using functools-kit\n" +
  "* **Context Propagation:** Nested contexts using di-scoped (ExecutionContext + MethodContext)\n" +
  "* **Registry Pattern:** Schema services use ToolRegistry for configuration management\n" +
  "* **Singleshot Initialization:** One-time operations with cached promise results\n" +
  "* **Persist-and-Restart:** Stateless process design with disk-based state recovery\n" +
  "* **Pluggable Adapters:** PersistBase as base class for custom storage backends\n" +
  "* **Queued Processing:** Sequential event handling with functools-kit queued wrapper\n" +
  "\n" +
  "**Data Flow (Backtest):**\n" +
  "\n" +
  "1. User calls Backtest.background(symbol, context) or Backtest.run(symbol, context)\n" +
  "2. Validation services check strategyName, exchangeName, frameName existence\n" +
  "3. BacktestLogicPrivateService.run(symbol) creates async generator with yield\n" +
  "4. MethodContextService.runInContext sets strategyName, exchangeName, frameName\n" +
  "5. Loop through timeframes, call StrategyGlobalService.tick()\n" +
  "6. ExecutionContextService.runInContext sets symbol, when, backtest=true\n" +
  "7. ClientStrategy.tick() checks VWAP against TP/SL conditions\n" +
  "8. If opened: fetch candles and call ClientStrategy.backtest(candles)\n" +
  "9. Yield closed result and skip timeframes until closeTimestamp\n" +
  "10. Emit signals via signalEmitter, signalBacktestEmitter\n" +
  "11. On completion emit doneEmitter with { backtest: true, symbol, strategyName, exchangeName }\n" +
  "\n" +
  "**Data Flow (Live):**\n" +
  "\n" +
  "1. User calls Live.background(symbol, context) or Live.run(symbol, context)\n" +
  "2. Validation services check strategyName, exchangeName existence\n" +
  "3. LiveLogicPrivateService.run(symbol) creates infinite async generator with while(true)\n" +
  "4. MethodContextService.runInContext sets schema names\n" +
  "5. Loop: create when = new Date(), call StrategyGlobalService.tick()\n" +
  "6. ClientStrategy.waitForInit() loads persisted signal state from PersistSignalAdaper\n" +
  "7. ClientStrategy.tick() with interval throttling and validation\n" +
  "8. setPendingSignal() persists state via PersistSignalAdaper.writeSignalData()\n" +
  "9. Yield opened and closed results, sleep(TICK_TTL) between ticks\n" +
  "10. Emit signals via signalEmitter, signalLiveEmitter\n" +
  "11. On stop() call: wait for lastValue?.action === 'closed' before breaking loop (graceful shutdown)\n" +
  "12. On completion emit doneEmitter with { backtest: false, symbol, strategyName, exchangeName }\n" +
  "\n" +
  "**Event System:**\n" +
  "\n" +
  "* **Signal Events:** listenSignal, listenSignalBacktest, listenSignalLive for tick results (idle/opened/active/closed)\n" +
  "* **Error Events:** listenError for background execution errors (Live.background, Backtest.background)\n" +
  "* **Completion Events:** listenDone, listenDoneOnce for background execution completion with DoneContract\n" +
  "* **Queued Processing:** All listeners use queued wrapper from functools-kit for sequential async execution\n" +
  "* **Filter Predicates:** Once listeners (listenSignalOnce, listenDoneOnce) accept filter function for conditional triggering\n" +
  "\n" +
  "**Performance Optimizations:**\n" +
  "\n" +
  "* Memoization of client instances by schema name\n" +
  "* Prototype methods (not arrow functions) for memory efficiency\n" +
  "* Fast backtest method skips individual ticks\n" +
  "* Timeframe skipping after signal closes\n" +
  "* VWAP caching per tick/candle\n" +
  "* Async generators stream without array accumulation\n" +
  "* Interval throttling prevents excessive signal generation\n" +
  "* Singleshot initialization runs exactly once per instance\n" +
  "* LiveMarkdownService bounded queue (MAX_EVENTS = 25) prevents memory leaks\n" +
  "* Smart idle event replacement (only replaces if no open/active signals after last idle)\n" +
  "\n" +
  "**Use Cases:**\n" +
  "\n" +
  "* Algorithmic trading with backtest validation and live deployment\n" +
  "* Strategy research and hypothesis testing on historical data\n" +
  "* Signal generation with ML models or technical indicators\n" +
  "* Portfolio management tracking multiple strategies across symbols\n" +
  "* Educational projects for learning trading system architecture\n" +
  "* Event-driven trading bots with real-time notifications (Telegram, Discord, email)\n" +
  "* Multi-exchange trading with pluggable exchange adapters\n" +
  "\n" +
  "**Test Coverage:**\n" +
  "\n" +
  "The framework includes comprehensive unit tests using worker-testbed (tape-based testing):\n" +
  "\n" +
  "* **exchange.test.mjs:** Tests exchange helper functions (getCandles, getAveragePrice, getDate, getMode, formatPrice, formatQuantity) with mock candle data and VWAP calculations\n" +
  "* **event.test.mjs:** Tests Live.background() execution and event listener system (listenSignalLive, listenSignalLiveOnce, listenDone, listenDoneOnce) for async coordination\n" +
  "* **validation.test.mjs:** Tests signal validation logic (valid long/short positions, invalid TP/SL relationships, negative price detection, timestamp validation) using listenError for error handling\n" +
  "* **pnl.test.mjs:** Tests PNL calculation accuracy with realistic fees (0.1%) and slippage (0.1%) simulation\n" +
  "* **backtest.test.mjs:** Tests Backtest.run() and Backtest.background() with signal lifecycle verification (idle → opened → active → closed), listenDone events, early termination, and all close reasons (take_profit, stop_loss, time_expired)\n" +
  "* **callbacks.test.mjs:** Tests strategy lifecycle callbacks (onOpen, onClose, onTimeframe) with correct parameter passing, backtest flag verification, and signal object integrity\n" +
  "* **report.test.mjs:** Tests markdown report generation (Backtest.getReport, Live.getReport) with statistics validation (win rate, average PNL, total PNL, closed signals count) and table formatting\n" +
  "\n" +
  "All tests follow consistent patterns:\n" +
  "* Unique exchange/strategy/frame names per test to prevent cross-contamination\n" +
  "* Mock candle generator (getMockCandles.mjs) with forward timestamp progression\n" +
  "* createAwaiter from functools-kit for async coordination\n" +
  "* Background execution with Backtest.background() and event-driven completion detection\n";

console.log("Loading model");

const pull = async () => {
  const response = await ollama.pull({
    model: "gemma3:12b",
    stream: true,
  });

  for await (const part of response) {
    if (!part.completed || !part.total) {
      continue;
    }

    // Calculate progress percentage
    const progress =
      part.total > 0 ? ((part.completed / part.total) * 100).toFixed(1) : 0;

    // Create simple progress bar
    const barLength = 40;
    const filledLength = Math.round((barLength * part.completed) / part.total);
    const bar = "█".repeat(filledLength) + "░".repeat(barLength - filledLength);

    // Display progress
    process.stdout.write(`\r[${bar}] ${progress}% ${part.status}`);

    if (part.status === "success") {
      console.log("\nModel pulled successfully!");
      break;
    }
  }

  console.log("Done!");
};

await pull();

const generateDescription = retry(
  async (filePath, prompt) => {
    console.log(`Generating content for ${resolve(filePath)}`);

    const data = fs.readFileSync(filePath).toString();

    const messages = [
      {
        content: prompt,
        role: "system",
      },
      {
        content: str.newline(
          'Do not write the header like "Okay, here’s a human-friendly summary".',
          'Do not write the header like "Okay, this is a comprehensive overview".',
          "Write the countent only like you are writing doc file directly.",
          `Write the human text only without markdown symbols epecially like: ${DISALLOWED_TEXT.map(
            (v) => `"${v}"`
          ).join(", ")}`,
          `You still can use lists and new lines if need`,
          "Do not write any headers started with #",
          'Never recommend anything else like "Would you like me to:"',
          "Never ask me about any information",
          "Never say ok or confirm you doing something"
        ),
        role: "system",
      },
      {
        content: data,
        role: "user",
      },
    ];

    let content;
    console.time("EXECUTE");
    try {
      const {
        message: { content: c },
      } = await ollama.chat({
        model: "gemma3:12b",
        keep_alive: "8h",
        options: {
          num_ctx: 48_000,
        },
        messages,
      });
      content = c;
    } catch (error) {
      console.error(`Caught an error for ${filePath}`, error);
      throw error;
    } finally {
      console.timeEnd("EXECUTE");
    }

    if (
      DISALLOWED_TEXT.some((text) =>
        content.toLowerCase().includes(text.toLowerCase())
      )
    ) {
      console.warn(`Found disallowed symbols for ${filePath}`);
      let result;
      console.time("EXECUTE");
      try {
        const {
          message: { content: r },
        } = await ollama.chat({
          model: "gemma3:12b",
          keep_alive: "8h",
          options: {
            num_ctx: 48_000,
          },
          messages: [
            ...messages,
            {
              content,
              role: "assistant",
            },
            {
              content:
                "I found dissalowed symbols in the output. Write the result correct",
              role: "user",
            },
          ],
        });
        result = r;
      } catch (error) {
        console.error(`Caught an error for ${filePath} (fix attempt)`);
        throw error;
      } finally {
        console.timeEnd("EXECUTE");
      }
      return result;
    }

    return content;
  },
  Number.POSITIVE_INFINITY,
  5_000
);

// Helper function to create document with header
const createDocumentWithHeader = (content, title, group) => {
  const output = [];
  output.push("---");
  output.push(`title: ${title}`);
  output.push(`group: ${group}`);
  output.push("---");
  output.push("");
  output.push(HEADER_CONTENT);
  output.push("");
  output.push(content);
  return output.join("\n");
};

// Generate functions document
{
  const functionsList = globSync(`./docs/functions/*`);
  const output = [];
  output.push(`# ${MODULE_NAME} functions`);
  output.push("");
  if (!functionsList.length) {
    output.push("No data available");
  }
  for (const functionPath of functionsList) {
    const functionName = basename(functionPath, extname(functionPath));
    const content = await generateDescription(functionPath, GPT_FUNCTION_PROMPT);
    if (content.trim()) {
      output.push(`## Function ${functionName}`);
      output.push("");
      output.push(content);
      output.push("");
    }
  }
  const outputPath = join(process.cwd(), "docs", "private", "functions.md");
  fs.writeFileSync(outputPath, createDocumentWithHeader(output.join("\n"), "private/functions", "private"));
}

// Generate classes document
{
  const classList = globSync(`./docs/classes/*`);
  const output = [];
  output.push(`# ${MODULE_NAME} classes`);
  output.push("");
  if (!classList.length) {
    output.push("No data available");
  }
  for (const classPath of classList) {
    const className = basename(classPath, extname(classPath));
    const content = await generateDescription(classPath, GPT_CLASS_PROMPT);
    if (content.trim()) {
      output.push(`## Class ${className}`);
      output.push("");
      output.push(content);
      output.push("");
    }
  }
  const outputPath = join(process.cwd(), "docs", "private", "classes.md");
  fs.writeFileSync(outputPath, createDocumentWithHeader(output.join("\n"), "private/classes", "private"));
}

// Generate interfaces document
{
  const interfaceList = globSync(`./docs/interfaces/*`);
  const output = [];
  output.push(`# ${MODULE_NAME} interfaces`);
  output.push("");
  if (!interfaceList.length) {
    output.push("No data available");
  }
  for (const interfacePath of interfaceList) {
    const interfaceName = basename(interfacePath, extname(interfacePath));
    const content = await generateDescription(
      interfacePath,
      GPT_INTERFACE_PROMPT
    );
    if (content.trim()) {
      output.push(`## Interface ${interfaceName}`);
      output.push("");
      output.push(content);
      output.push("");
    }
  }
  const outputPath = join(process.cwd(), "docs", "private", "interfaces.md");
  fs.writeFileSync(outputPath, createDocumentWithHeader(output.join("\n"), "private/interfaces", "private"));
}
