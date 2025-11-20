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

const MODULE_NAME = "agent-swarm-kit";

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
  "**Overview:**\n" +
  "\n" +
  "Backtest-kit is a production-ready TypeScript framework for backtesting and live trading strategies with crash-safe state persistence, signal validation, and memory-optimized architecture. The framework follows clean architecture principles with dependency injection, separation of concerns, and type-safe discriminated unions.\n" +
  "\n" +
  "**Production Readiness:** 8.5/10 - The system is well-designed for real-world usage with robust error recovery, signal validation, and memory optimizations.\n" +
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
  "\n" +
  "**Architecture Layers:**\n" +
  "\n" +
  "* **Client Layer:** Pure business logic without DI (ClientStrategy, ClientExchange, ClientFrame) using prototype methods for memory efficiency\n" +
  "* **Service Layer:** DI-based services organized by responsibility:\n" +
  "  * **Schema Services:** Registry pattern for configuration (StrategySchemaService, ExchangeSchemaService, FrameSchemaService)\n" +
  "  * **Connection Services:** Memoized client instance creators (StrategyConnectionService, ExchangeConnectionService, FrameConnectionService)\n" +
  "  * **Global Services:** Context wrappers for public API (StrategyGlobalService, ExchangeGlobalService, FrameGlobalService)\n" +
  "  * **Logic Services:** Async generator orchestration (BacktestLogicPrivateService, LiveLogicPrivateService)\n" +
  "* **Persistence Layer:** Crash-safe atomic file writes with PersistSignalAdaper\n" +
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
  "\n" +
  "**Data Flow (Backtest):**\n" +
  "\n" +
  "1. User calls BacktestLogicPrivateService.run(symbol)\n" +
  "2. Async generator with yield streams results\n" +
  "3. MethodContextService.runInContext sets strategyName, exchangeName, frameName\n" +
  "4. Loop through timeframes, call StrategyGlobalService.tick()\n" +
  "5. ExecutionContextService.runInContext sets symbol, when, backtest flag\n" +
  "6. ClientStrategy.tick() checks VWAP against TP/SL conditions\n" +
  "7. If opened: fetch candles and call ClientStrategy.backtest(candles)\n" +
  "8. Yield closed result and skip timeframes until closeTimestamp\n" +
  "\n" +
  "**Data Flow (Live):**\n" +
  "\n" +
  "1. User calls LiveLogicPrivateService.run(symbol)\n" +
  "2. Infinite async generator with while(true) loop\n" +
  "3. MethodContextService.runInContext sets schema names\n" +
  "4. Loop: create when = new Date(), call StrategyGlobalService.tick()\n" +
  "5. ClientStrategy.waitForInit() loads persisted signal state\n" +
  "6. ClientStrategy.tick() with interval throttling and validation\n" +
  "7. setPendingSignal() persists state to disk automatically\n" +
  "8. Yield opened and closed results, sleep(TICK_TTL) between ticks\n" +
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
  "\n" +
  "**Use Cases:**\n" +
  "\n" +
  "* Algorithmic trading with backtest validation and live deployment\n" +
  "* Strategy research and hypothesis testing on historical data\n" +
  "* Signal generation with ML models or technical indicators\n" +
  "* Portfolio management tracking multiple strategies across symbols\n" +
  "* Educational projects for learning trading system architecture\n";

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

const outputPath = join(process.cwd(), "docs", `internals.md`);
const output = [];

{
  const classList = globSync(`./docs/functions/*`);
  output.push(`# ${MODULE_NAME} functions`);
  output.push("");
  if (!classList.length) {
    output.push("No data available");
  }
  for (const classPath of classList) {
    const className = basename(classPath, extname(classPath));
    const content = await generateDescription(classPath, GPT_FUNCTION_PROMPT);
    if (content.trim()) {
      output.push(`## Function ${className}`);
      output.push("");
      output.push(content);
      output.push("");
    }
    fs.writeFileSync(outputPath, output.join("\n"));
  }
}

{
  const classList = globSync(`./docs/classes/*`);
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
    fs.writeFileSync(outputPath, output.join("\n"));
  }
}

{
  const interfaceList = globSync(`./docs/interfaces/*`);
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
    fs.writeFileSync(outputPath, output.join("\n"));
  }
}

{
  output.unshift("");
  output.unshift(HEADER_CONTENT);
}
{
  output.unshift("");
  output.unshift("---");
  output.unshift(`group: docs`);
  output.unshift(`title: docs/internals`);
  output.unshift("---");
}

fs.writeFileSync(outputPath, output.join("\n"));
