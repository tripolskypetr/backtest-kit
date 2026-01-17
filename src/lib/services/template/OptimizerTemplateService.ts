import { inject } from "../../../lib/core/di";
import {
  IOptimizerData,
  IOptimizerTemplate,
} from "../../../interfaces/Optimizer.interface";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import {
  CandleInterval,
  ExchangeName,
} from "../../../interfaces/Exchange.interface";
import { toPlainString } from "../../../helpers/toPlainString";
import { FrameName } from "../../../interfaces/Frame.interface";
import { StrategyName } from "../../../interfaces/Strategy.interface";
import { WalkerName } from "../../../interfaces/Walker.interface";

/**
 * Default template service for generating optimizer code snippets.
 * Implements all IOptimizerTemplate methods with Ollama LLM integration.
 *
 * Features:
 * - Multi-timeframe analysis (1m, 5m, 15m, 1h)
 * - JSON structured output for signals
 * - Debug logging to ./dump/strategy
 * - CCXT exchange integration
 * - Walker-based strategy comparison
 *
 * Can be partially overridden in optimizer schema configuration.
 */
export class OptimizerTemplateService implements IOptimizerTemplate {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * Generates the top banner with imports and constants.
   *
   * @param symbol - Trading pair symbol
   * @returns Shebang, imports, and WARN_KB constant
   */
  public getTopBanner = async (symbol: string) => {
    this.loggerService.log("optimizerTemplateService getTopBanner", {
      symbol,
    });
    return [
      "#!/usr/bin/env node",
      "",
      `import { Ollama } from "ollama";`,
      `import ccxt from "ccxt";`,
      `import {`,
      `    addExchangeSchema,`,
      `    addStrategySchema,`,
      `    addFrameSchema,`,
      `    addWalkerSchema,`,
      `    Walker,`,
      `    Backtest,`,
      `    getCandles,`,
      `    listenSignalBacktest,`,
      `    listenWalkerComplete,`,
      `    listenDoneBacktest,`,
      `    listenBacktestProgress,`,
      `    listenWalkerProgress,`,
      `    listenError,`,
      `    Markdown,`,
      `} from "backtest-kit";`,
      `import { promises as fs } from "fs";`,
      `import { v4 as uuid } from "uuid";`,
      `import path from "path";`,
      ``,
      `const WARN_KB = 100;`,
      ``,
      `Markdown.enable()`,
    ].join("\n");
  };

  /**
   * Generates default user message for LLM conversation.
   * Simple prompt to read and acknowledge data.
   *
   * @param symbol - Trading pair symbol
   * @param data - Fetched data array
   * @param name - Source name
   * @returns User message with JSON data
   */
  public getUserMessage = async (
    symbol: string,
    data: IOptimizerData[],
    name: string
  ) => {
    this.loggerService.log("optimizerTemplateService getUserMessage", {
      symbol,
      data,
      name,
    });
    return ["Прочитай данные и скажи ОК", "", JSON.stringify(data)].join("\n");
  };

  /**
   * Generates default assistant message for LLM conversation.
   * Simple acknowledgment response.
   *
   * @param symbol - Trading pair symbol
   * @param data - Fetched data array
   * @param name - Source name
   * @returns Assistant acknowledgment message
   */
  public getAssistantMessage = async (
    symbol: string,
    data: IOptimizerData[],
    name: string
  ) => {
    this.loggerService.log("optimizerTemplateService getAssistantMessage", {
      symbol,
      data,
      name,
    });
    return "ОК";
  };

  /**
   * Generates Walker configuration code.
   * Compares multiple strategies on test frame.
   *
   * @param walkerName - Unique walker identifier
   * @param exchangeName - Exchange to use for backtesting
   * @param frameName - Test frame name
   * @param strategies - Array of strategy names to compare
   * @returns Generated addWalker() call
   */
  public getWalkerTemplate = async (
    walkerName: WalkerName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    strategies: string[]
  ) => {
    this.loggerService.log("optimizerTemplateService getWalkerTemplate", {
      walkerName,
      exchangeName,
      frameName,
      strategies,
    });

    // Escape special characters to prevent code injection
    const escapedWalkerName = String(walkerName)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
    const escapedExchangeName = String(exchangeName)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
    const escapedFrameName = String(frameName)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
    const escapedStrategies = strategies.map((s) =>
      String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    );

    return [
      `addWalkerSchema({`,
      `    walkerName: "${escapedWalkerName}",`,
      `    exchangeName: "${escapedExchangeName}",`,
      `    frameName: "${escapedFrameName}",`,
      `    strategies: [${escapedStrategies.map((s) => `"${s}"`).join(", ")}],`,
      `});`
    ].join("\n");
  };

  /**
   * Generates Strategy configuration with LLM integration.
   * Includes multi-timeframe analysis and signal generation.
   *
   * @param strategyName - Unique strategy identifier
   * @param interval - Signal throttling interval (e.g., "5m")
   * @param prompt - Strategy logic from getPrompt()
   * @returns Generated addStrategy() call with getSignal() function
   */
  public getStrategyTemplate = async (
    strategyName: StrategyName,
    interval: CandleInterval,
    prompt: string
  ) => {
    this.loggerService.log("optimizerTemplateService getStrategyTemplate", {
      strategyName,
      interval,
      prompt,
    });

    // Convert prompt to plain text first
    const plainPrompt = toPlainString(prompt);

    // Escape special characters to prevent code injection
    const escapedStrategyName = String(strategyName)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
    const escapedInterval = String(interval)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
    const escapedPrompt = String(plainPrompt)
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$');

    return [
      `addStrategySchema({`,
      `    strategyName: "${escapedStrategyName}",`,
      `    interval: "${escapedInterval}",`,
      `    getSignal: async (symbol) => {`,
      `        const messages = [];`,
      ``,
      `        // Загружаем данные всех таймфреймов`,
      `        const microTermCandles = await getCandles(symbol, "1m", 30);`,
      `        const mainTermCandles = await getCandles(symbol, "5m", 24);`,
      `        const shortTermCandles = await getCandles(symbol, "15m", 24);`,
      `        const mediumTermCandles = await getCandles(symbol, "1h", 24);`,
      ``,
      `        function formatCandles(candles, timeframe) {`,
      `            return candles.map((c) =>`,
      `                \`\${new Date(c.timestamp).toISOString()}[\${timeframe}]: O:\${c.open} H:\${c.high} L:\${c.low} C:\${c.close} V:\${c.volume}\``,
      `            ).join("\\n");`,
      `        }`,
      ``,
      `        // Сообщение 1: Среднесрочный тренд`,
      `        messages.push(`,
      `            {`,
      `                role: "user",`,
      `                content: [`,
      `                    \`\${symbol}\`,`,
      `                    "Проанализируй свечи 1h:",`,
      `                    "",`,
      `                    formatCandles(mediumTermCandles, "1h")`,
      `                ].join("\\n"),`,
      `            },`,
      `            {`,
      `                role: "assistant",`,
      `                content: "Тренд 1h проанализирован",`,
      `            }`,
      `        );`,
      ``,
      `        // Сообщение 2: Краткосрочный тренд`,
      `        messages.push(`,
      `            {`,
      `                role: "user",`,
      `                content: [`,
      `                    "Проанализируй свечи 15m:",`,
      `                    "",`,
      `                    formatCandles(shortTermCandles, "15m")`,
      `                ].join("\\n"),`,
      `            },`,
      `            {`,
      `                role: "assistant",`,
      `                content: "Тренд 15m проанализирован",`,
      `            }`,
      `        );`,
      ``,
      `        // Сообщение 3: Основной таймфрейм`,
      `        messages.push(`,
      `            {`,
      `                role: "user",`,
      `                content: [`,
      `                    "Проанализируй свечи 5m:",`,
      `                    "",`,
      `                    formatCandles(mainTermCandles, "5m")`,
      `                ].join("\\n")`,
      `            },`,
      `            {`,
      `                role: "assistant",`,
      `                content: "Таймфрейм 5m проанализирован",`,
      `            }`,
      `        );`,
      ``,
      `        // Сообщение 4: Микро-структура`,
      `        messages.push(`,
      `            {`,
      `                role: "user",`,
      `                content: [`,
      `                    "Проанализируй свечи 1m:",`,
      `                    "",`,
      `                    formatCandles(microTermCandles, "1m")`,
      `                ].join("\\n")`,
      `            },`,
      `            {`,
      `                role: "assistant",`,
      `                content: "Микроструктура 1m проанализирована",`,
      `            }`,
      `        );`,
      ``,
      `        // Сообщение 5: Запрос сигнала`,
      `        messages.push(`,
      `            {`,
      `                role: "user",`,
      `                content: [`,
      `                    "Проанализируй все таймфреймы и сгенерируй торговый сигнал согласно этой стратегии. Открывай позицию ТОЛЬКО при четком сигнале.",`,
      `                    "",`,
      `                    \`${escapedPrompt}\`,`,
      `                    "",`,
      `                    "Если сигналы противоречивы или тренд слабый то position: wait"`,
      `                ].join("\\n"),`,
      `            }`,
      `        );`,
      ``,
      `        const resultId = uuid();`,
      ``,
      `        const result = await json(messages);`,
      ``,
      `        await dumpJson(resultId, messages, result);`,
      ``,
      `        result.id = resultId;`,
      ``,
      `        return result;`,
      `    },`,
      `});`
    ].join("\n");
  };

  /**
   * Generates Exchange configuration code.
   * Uses CCXT Binance with standard formatters.
   *
   * @param symbol - Trading pair symbol (unused, for consistency)
   * @param exchangeName - Unique exchange identifier
   * @returns Generated addExchange() call with CCXT integration
   */
  public getExchangeTemplate = async (
    symbol: string,
    exchangeName: ExchangeName
  ) => {
    this.loggerService.log("optimizerTemplateService getExchangeTemplate", {
      exchangeName,
      symbol,
    });

    // Escape special characters to prevent code injection
    const escapedExchangeName = String(exchangeName)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');

    return [
      `addExchangeSchema({`,
      `    exchangeName: "${escapedExchangeName}",`,
      `    getCandles: async (symbol, interval, since, limit) => {`,
      `        const exchange = new ccxt.binance();`,
      `        const ohlcv = await exchange.fetchOHLCV(symbol, interval, since.getTime(), limit);`,
      `        return ohlcv.map(([timestamp, open, high, low, close, volume]) => ({`,
      `            timestamp, open, high, low, close, volume`,
      `        }));`,
      `    },`,
      `    formatPrice: async (symbol, price) => price.toFixed(2),`,
      `    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),`,
      `});`
    ].join("\n");
  };

  /**
   * Generates Frame (timeframe) configuration code.
   *
   * @param symbol - Trading pair symbol (unused, for consistency)
   * @param frameName - Unique frame identifier
   * @param interval - Candle interval (e.g., "1m")
   * @param startDate - Frame start date
   * @param endDate - Frame end date
   * @returns Generated addFrame() call
   */
  public getFrameTemplate = async (
    symbol: string,
    frameName: FrameName,
    interval: CandleInterval,
    startDate: Date,
    endDate: Date
  ) => {
    this.loggerService.log("optimizerTemplateService getFrameTemplate", {
      symbol,
      frameName,
      interval,
      startDate,
      endDate,
    });

    // Escape special characters to prevent code injection
    const escapedFrameName = String(frameName)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
    const escapedInterval = String(interval)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');

    return [
      `addFrameSchema({`,
      `    frameName: "${escapedFrameName}",`,
      `    interval: "${escapedInterval}",`,
      `    startDate: new Date("${startDate.toISOString()}"),`,
      `    endDate: new Date("${endDate.toISOString()}"),`,
      `});`
    ].join("\n");
  };

  /**
   * Generates launcher code to run Walker with event listeners.
   * Includes progress tracking and completion handlers.
   *
   * @param symbol - Trading pair symbol
   * @param walkerName - Walker name to launch
   * @returns Generated Walker.background() call with listeners
   */
  public getLauncherTemplate = async (symbol: string, walkerName: WalkerName) => {
    this.loggerService.log("optimizerTemplateService getLauncherTemplate", {
      symbol,
      walkerName,
    });

    // Escape special characters to prevent code injection
    const escapedSymbol = String(symbol)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
    const escapedWalkerName = String(walkerName)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');

    return [
      `Walker.background("${escapedSymbol}", {`,
      `    walkerName: "${escapedWalkerName}"`,
      `});`,
      ``,
      `listenSignalBacktest((event) => {`,
      `    console.log(event);`,
      `});`,
      ``,
      `listenBacktestProgress((event) => {`,
      `    console.log(\`Progress: \${(event.progress * 100).toFixed(2)}%\`);`,
      `    console.log(\`Processed: \${event.processedFrames} / \${event.totalFrames}\`);`,
      `});`,
      ``,
      `listenWalkerProgress((event) => {`,
      `    console.log(\`Progress: \${(event.progress * 100).toFixed(2)}%\`);`,
      `    console.log(\`\${event.processedStrategies} / \${event.totalStrategies} strategies\`);`,
      `    console.log(\`Walker: \${event.walkerName}, Symbol: \${event.symbol}\`);`,
      `});`,
      ``,
      `listenWalkerComplete((results) => {`,
      `    console.log("Walker completed:", results.bestStrategy);`,
      `    Walker.dump(results.symbol, { walkerName: results.walkerName });`,
      `});`,
      ``,
      `listenDoneBacktest((event) => {`,
      `    console.log("Backtest completed:", event.symbol);`,
      `    Backtest.dump(event.symbol, {`,
      `        strategyName: event.strategyName,`,
      `        exchangeName: event.exchangeName,`,
      `        frameName: event.frameName`,
      `    });`,
      `});`,
      ``,
      `listenError((error) => {`,
      `    console.error("Error occurred:", error);`,
      `});`
    ].join("\n");
  };

  /**
   * Generates dumpJson() helper function for debug output.
   * Saves LLM conversations and results to ./dump/strategy/{resultId}/
   *
   * @param symbol - Trading pair symbol (unused, for consistency)
   * @returns Generated async dumpJson() function
   */
  public getJsonDumpTemplate = async (symbol: string) => {
    this.loggerService.log("optimizerTemplateService getJsonDumpTemplate", {
      symbol,
    });
    return [
      `async function dumpJson(resultId, history, result, outputDir = "./dump/strategy") {`,
      `    // Extract system messages and system reminders from existing data`,
      `    const systemMessages = history.filter((m) => m.role === "system");`,
      `    const userMessages = history.filter((m) => m.role === "user");`,
      `    const subfolderPath = path.join(outputDir, resultId);`,
      ``,
      `    try {`,
      `        await fs.access(subfolderPath);`,
      `        return;`,
      `    } catch {`,
      `        await fs.mkdir(subfolderPath, { recursive: true });`,
      `    }`,
      ``,
      `    {`,
      `        let summary = "# Outline Result Summary\\n\\n";`,
      ``,
      `        {`,
      `            summary += \`**ResultId**: \${resultId}\\n\\n\`;`,
      `        }`,
      ``,
      `        if (result) {`,
      `            summary += "## Output Data\\n\\n";`,
      `            summary += "\`\`\`json\\n";`,
      `            summary += JSON.stringify(result, null, 2);`,
      `            summary += "\\n\`\`\`\\n\\n";`,
      `        }`,
      ``,
      `        // Add system messages to summary`,
      `        if (systemMessages.length > 0) {`,
      `            summary += "## System Messages\\n\\n";`,
      `            systemMessages.forEach((msg, idx) => {`,
      `                summary += \`### System Message \${idx + 1}\\n\\n\`;`,
      `                summary += msg.content;`,
      `                summary += "\\n\\n";`,
      `            });`,
      `        }`,
      ``,
      `        const summaryFile = path.join(subfolderPath, "00_system_prompt.md");`,
      `        await fs.writeFile(summaryFile, summary, "utf8");`,
      `    }`,
      ``,
      `    {`,
      `        await Promise.all(`,
      `            Array.from(userMessages.entries()).map(async ([idx, message]) => {`,
      `                const messageNum = String(idx + 1).padStart(2, "0");`,
      `                const contentFileName = \`\${messageNum}_user_message.md\`;`,
      `                const contentFilePath = path.join(subfolderPath, contentFileName);`,
      ``,
      `                {`,
      `                    const messageSizeBytes = Buffer.byteLength(message.content, "utf8");`,
      `                    const messageSizeKb = Math.floor(messageSizeBytes / 1024);`,
      `                    if (messageSizeKb > WARN_KB) {`,
      `                        console.warn(`,
      `                            \`User message \${idx + 1} is \${messageSizeBytes} bytes (\${messageSizeKb}kb), which exceeds warning limit\``,
      `                        );`,
      `                    }`,
      `                }`,
      ``,
      `                let content = \`# User Input \${idx + 1}\\n\\n\`;`,
      `                content += \`**ResultId**: \${resultId}\\n\\n\`;`,
      `                content += message.content;`,
      `                content += "\\n";`,
      ``,
      `                await fs.writeFile(contentFilePath, content, "utf8");`,
      `            })`,
      `        );`,
      `    }`,
      ``,
      `    {`,
      `        const messageNum = String(userMessages.length + 1).padStart(2, "0");`,
      `        const contentFileName = \`\${messageNum}_llm_output.md\`;`,
      `        const contentFilePath = path.join(subfolderPath, contentFileName);`,
      ``,
      `        let content = "# Full Outline Result\\n\\n";`,
      `        content += \`**ResultId**: \${resultId}\\n\\n\`;`,
      ``,
      `        if (result) {`,
      `            content += "## Output Data\\n\\n";`,
      `            content += "\`\`\`json\\n";`,
      `            content += JSON.stringify(result, null, 2);`,
      `            content += "\\n\`\`\`\\n";`,
      `        }`,
      ``,
      `        await fs.writeFile(contentFilePath, content, "utf8");`,
      `    }`,
      `}`
    ].join("\n");
  };

  /**
   * Generates text() helper for LLM text generation.
   * Uses Ollama deepseek-v3.1:671b model for market analysis.
   *
   * @param symbol - Trading pair symbol (used in prompt)
   * @returns Generated async text() function
   */
  public getTextTemplate = async (symbol: string) => {
    this.loggerService.log("optimizerTemplateService getTextTemplate", {
      symbol,
    });

    // Escape special characters in symbol to prevent code injection
    const escapedSymbol = String(symbol)
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$')
      .toUpperCase();

    return [
      `async function text(messages) {`,
      `    const ollama = new Ollama({`,
      `        host: "https://ollama.com",`,
      `        headers: {`,
      `            Authorization: \`Bearer \${process.env.OLLAMA_API_KEY}\`,`,
      `        },`,
      `    });`,
      ``,
      `    const response = await ollama.chat({`,
      `        model: "deepseek-v3.1:671b",`,
      `        messages: [`,
      `            {`,
      `                role: "system",`,
      `                content: [`,
      `                    "В ответ напиши торговую стратегию где нет ничего лишнего,",`,
      `                    "только отчёт готовый для копипасты целиком",`,
      `                    "",`,
      `                    "**ВАЖНО**: Не здоровайся, не говори что делаешь - только отчёт!"`,
      `                ].join("\\n"),`,
      `            },`,
      `            ...messages,`,
      `            {`,
      `                role: "user",`,
      `                content: [`,
      `                    "На каких условиях мне купить ${escapedSymbol}?",`,
      `                    "Дай анализ рынка на основе поддержки/сопротивления, точек входа в LONG/SHORT позиции.",`,
      `                    "Какой RR ставить для позиций?",`,
      `                    "Предпочтительны LONG или SHORT позиции?",`,
      `                    "",`,
      `                    "Сделай не сухой технический, а фундаментальный анализ, содержащий стратигическую рекомендацию, например, покупать на низу боковика"`,
      `                ].join("\\n")`,
      `            }`,
      `        ]`,
      `    });`,
      ``,
      `    const content = response.message.content.trim();`,
      `    return content`,
      `        .replace(/\\\\/g, '\\\\\\\\')`,
      `        .replace(/\`/g, '\\\\\`')`,
      `        .replace(/\\$/g, '\\\\$')`,
      `        .replace(/"/g, '\\\\"')`,
      `        .replace(/'/g, "\\\\'");`,
      `}`
    ].join("\n");
  };

  /**
   * Generates json() helper for structured LLM output.
   * Uses Ollama with JSON schema for trading signals.
   *
   * Signal schema:
   * - position: "wait" | "long" | "short"
   * - note: strategy explanation
   * - priceOpen: entry price
   * - priceTakeProfit: target price
   * - priceStopLoss: stop price
   * - minuteEstimatedTime: expected duration (max 360 min)
   *
   * @param symbol - Trading pair symbol (unused, for consistency)
   * @returns Generated async json() function with signal schema
   */
  public getJsonTemplate = async (symbol: string) => {
    this.loggerService.log("optimizerTemplateService getJsonTemplate", {
      symbol,
    });
    return [
      `async function json(messages) {`,
      `    const ollama = new Ollama({`,
      `        host: "https://ollama.com",`,
      `        headers: {`,
      `            Authorization: \`Bearer \${process.env.OLLAMA_API_KEY}\`,`,
      `        },`,
      `    });`,
      ``,
      `    const response = await ollama.chat({`,
      `        model: "deepseek-v3.1:671b",`,
      `        messages: [`,
      `            {`,
      `                role: "system",`,
      `                content: [`,
      `                    "Проанализируй торговую стратегию и верни торговый сигнал.",`,
      `                    "",`,
      `                    "ПРАВИЛА ОТКРЫТИЯ ПОЗИЦИЙ:",`,
      `                    "",`,
      `                    "1. ТИПЫ ПОЗИЦИЙ:",`,
      `                    "   - position='wait': нет четкого сигнала, жди лучших условий",`,
      `                    "   - position='long': бычий сигнал, цена будет расти",`,
      `                    "   - position='short': медвежий сигнал, цена будет падать",`,
      `                    "",`,
      `                    "2. ЦЕНА ВХОДА (priceOpen):",`,
      `                    "   - Может быть текущей рыночной ценой для немедленного входа",`,
      `                    "   - Может быть отложенной ценой для входа при достижении уровня",`,
      `                    "   - Укажи оптимальную цену входа согласно технического анализа",`,
      `                    "",`,
      `                    "3. УРОВНИ ВЫХОДА:",`,
      `                    "   - LONG: priceTakeProfit > priceOpen > priceStopLoss",`,
      `                    "   - SHORT: priceStopLoss > priceOpen > priceTakeProfit",`,
      `                    "   - Уровни должны иметь техническое обоснование (Fibonacci, S/R, Bollinger)",`,
      `                    "",`,
      `                    "4. ВРЕМЕННЫЕ РАМКИ:",`,
      `                    "   - minuteEstimatedTime: прогноз времени до TP (макс 360 минут)",`,
      `                    "   - Расчет на основе ATR, ADX, MACD, Momentum, Slope",`,
      `                    "   - Если индикаторов, осциллятор или других метрик нет, посчитай их самостоятельно",`,
      `                ].join("\\n"),`,
      `            },`,
      `            ...messages,`,
      `        ],`,
      `        format: {`,
      `            type: "object",`,
      `            properties: {`,
      `                position: {`,
      `                    type: "string",`,
      `                    enum: ["wait", "long", "short"],`,
      `                    description: "Trade decision: wait (no signal), long (buy), or short (sell)",`,
      `                },`,
      `                note: {`,
      `                    type: "string",`,
      `                    description: "Professional trading recommendation with price levels",`,
      `                },`,
      `                priceOpen: {`,
      `                    type: "number",`,
      `                    description: "Entry price (current market price or limit order price)",`,
      `                },`,
      `                priceTakeProfit: {`,
      `                    type: "number",`,
      `                    description: "Take profit target price",`,
      `                },`,
      `                priceStopLoss: {`,
      `                    type: "number",`,
      `                    description: "Stop loss exit price",`,
      `                },`,
      `                minuteEstimatedTime: {`,
      `                    type: "number",`,
      `                    description: "Expected time to reach TP in minutes (max 360)",`,
      `                },`,
      `            },`,
      `            required: ["position", "note", "priceOpen", "priceTakeProfit", "priceStopLoss", "minuteEstimatedTime"],`,
      `        },`,
      `    });`,
      ``,
      `    const jsonResponse = JSON.parse(response.message.content.trim());`,
      `    return jsonResponse;`,
      `}`
    ].join("\n");
  };
}

export default OptimizerTemplateService;
